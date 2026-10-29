// #58: access status and warnings on paddle legs, and a warning chip per leg on day rows (ADR 0029).
// The trip is seeded in browser storage with a paddle leg routed along the
// Ghent–Terneuzen canal, which the built-in Flemish data marks as forbidden.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { closeLegDetails, exportGpxFile, freeMapCentre, legDetailsDialog, legLines, openLegDetails, openPlanner, saveTripFile, showTab } from "./support/planner";

/** Along the Ghent–Terneuzen canal, from the built-in data's geometry. */
const canal = [
  { lat: 51.08505, lng: 3.72577 },
  { lat: 51.08631, lng: 3.72596 },
  { lat: 51.09192, lng: 3.72955 },
];
/** A short hike to the put-in, west of the canal. */
const start = { lat: 51.085, lng: 3.715 };

function seededTrip(startDate?: string, water = canal) {
  const routed = (points: { lat: number; lng: number }[]) => ({
    status: "routed",
    geometry: points.map((p) => ({ ...p, elevation: 5 })),
  });
  return {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Canal trip",
      points: [start, water[0], water[water.length - 1]],
      legs: [
        { mode: "hike", route: routed([start, water[0]]) },
        { mode: "paddle", route: routed(water) },
      ],
      ...(startDate && { startDate }),
    },
  };
}

/** Seeds the trip before the page's first load only, so reloads keep the app's own saves. */
async function seed(page: Page, startDate?: string, water = canal) {
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", save);
  }, JSON.stringify(seededTrip(startDate, water)));
}

const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
const legRow = (page: Page, n: number) => legsPanel(page).locator(".phone-row").nth(n);
const daysPanel = (page: Page) => page.getByRole("complementary", { name: strings.daysPanelLabel });
const dayChips = (page: Page) =>
  daysPanel(page).getByRole("group", { name: strings.tripAccess.dayWarningsLabel }).getByRole("button");
const legDetails = legDetailsDialog;

test.use({ viewport: { width: 1400, height: 900 } });

test("a paddle leg on a forbidden Flemish canal shows a warning with its reason; nothing is blocked", async ({ page }) => {
  const network = await serveOffline(page);
  await seed(page, "2027-07-10");
  await openPlanner(page);

  // The paddle leg: status for its day's date, and a warning with the reason and source.
  await openLegDetails(page, 2);
  const paddle = legDetails(page);
  await expect(paddle.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Sat 10 Jul 2027", strings.accessState.forbidden),
  );
  const warning = paddle.locator(".access-warning").filter({ hasText: "Ghent–Terneuzen canal" });
  await expect(warning).toContainText(strings.tripAccess.warningKind.forbidden);
  await expect(warning).toContainText("De Vlaamse Waterweg excludes the Ghent–Terneuzen canal");
  await expect(warning.getByRole("link")).toHaveAttribute("href", /^https:\/\//);
  await closeLegDetails(page);

  // The hike leg has no access status, and no details to show.
  await expect(legRow(page, 0).locator(".leg-access-icons")).toHaveCount(0);
  await expect(legRow(page, 0).getByRole("button", { name: strings.phone.legDetailsButton(1) })).toHaveCount(0);

  // The day card only points at the leg: one chip, no warning text, and no trip summary (ADR 0029).
  await showTab(page, strings.phone.tabs.days);
  const day = daysPanel(page).getByRole("listitem").first();
  const forbidden = strings.tripAccess.chipKind.forbidden;
  await expect(dayChips(page)).toHaveCount(1);
  await expect(dayChips(page)).toHaveText(strings.tripAccess.chip(2, forbidden));
  await expect(dayChips(page)).toHaveAccessibleName(strings.tripAccess.chipName(2, forbidden, 1));
  await expect(day).not.toContainText("Ghent–Terneuzen canal");
  await expect(page.getByText("Access summary")).toHaveCount(0);

  // The chip shows its leg's details (#158).
  await dayChips(page).click();
  await expect(legDetails(page)).toHaveAccessibleName(/^Leg 2 · /);
  await expect(legDetails(page)).toContainText("Ghent–Terneuzen canal");
  await closeLegDetails(page);

  // Warnings never block: saving and exporting still work, and so does editing.
  const save = await saveTripFile(page);
  expect(save.suggestedFilename()).toMatch(/\.packraft\.json$/);
  const gpx = await exportGpxFile(page);
  expect(gpx.suggestedFilename()).toMatch(/\.zip$/);
  const centre = await freeMapCentre(page);
  await page.mouse.click(centre.x, centre.y);
  await expect(legLines(page)).toHaveCount(3);
  expect(network.blocked).toEqual([]);
});

test("an undated trip shows the rules in general terms", async ({ page }) => {
  await serveOffline(page);
  await seed(page);
  await openPlanner(page);
  await openLegDetails(page, 2);
  await expect(legDetails(page).locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusInGeneral(strings.accessState.forbidden),
  );
  await expect(legDetails(page)).toContainText("De Vlaamse Waterweg excludes the Ghent–Terneuzen canal");
});

test("a paddle leg on the Meuse at Dinant (unlisted Walloon water) shows a Forbidden warning with the AGW reason (#59)", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "2027-07-10", [
    { lat: 50.26, lng: 4.91 },
    { lat: 50.265, lng: 4.915 },
  ]);
  await openPlanner(page);
  await openLegDetails(page, 2);
  const paddle = legDetails(page);
  await expect(paddle.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Sat 10 Jul 2027", strings.accessState.forbidden),
  );
  await expect(paddle.locator(".access-warning").first()).toContainText(strings.tripAccess.warningKind.forbidden);
  await expect(paddle).toContainText("AGW");
});
