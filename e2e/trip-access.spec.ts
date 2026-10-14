// #58: access status and warnings on paddle legs, day rows and a trip summary.
// The trip is seeded in browser storage with a paddle leg routed along the
// Ghent–Terneuzen canal, which the built-in Flemish data marks as forbidden.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

/** Along the Ghent–Terneuzen canal, from the built-in data's geometry. */
const canal = [
  { lat: 51.08505, lng: 3.72577 },
  { lat: 51.08631, lng: 3.72596 },
  { lat: 51.09192, lng: 3.72955 },
];
/** A short hike to the put-in, west of the canal. */
const start = { lat: 51.085, lng: 3.715 };

function seededTrip(startDate?: string) {
  const routed = (points: { lat: number; lng: number }[]) => ({
    status: "routed",
    geometry: points.map((p) => ({ ...p, elevation: 5 })),
  });
  return {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Canal trip",
      points: [start, canal[0], canal[2]],
      legs: [
        { mode: "hike", route: routed([start, canal[0]]) },
        { mode: "paddle", route: routed(canal) },
      ],
      ...(startDate && { startDate }),
    },
  };
}

/** Seeds the trip before the page's first load only, so reloads keep the app's own saves. */
async function seed(page: Page, startDate?: string) {
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", save);
  }, JSON.stringify(seededTrip(startDate)));
}

const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legRow = (page: Page, n: number) => legsPanel(page).locator(".leg-row").nth(n);
const daysPanel = (page: Page) => page.getByRole("complementary", { name: strings.daysPanelLabel });
const tripSummary = (page: Page) => page.getByRole("region", { name: strings.tripAccess.summaryLabel });

test.use({ viewport: { width: 1400, height: 900 } });

test("a paddle leg on a forbidden Flemish canal shows a warning with its reason; nothing is blocked", async ({ page }) => {
  const network = await serveOffline(page);
  await seed(page, "2027-07-10");
  await page.goto("/");

  // The paddle leg: status for its day's date, and a warning with the reason and source.
  const paddle = legRow(page, 1);
  await expect(paddle.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Sat 10 Jul 2027", strings.accessState.forbidden),
  );
  const warning = paddle.locator(".access-warning").filter({ hasText: "Ghent–Terneuzen canal" });
  await expect(warning).toContainText(strings.tripAccess.warningKind.forbidden);
  await expect(warning).toContainText("De Vlaamse Waterweg excludes the Ghent–Terneuzen canal");
  await expect(warning.getByRole("link")).toHaveAttribute("href", /^https:\/\//);

  // The hike leg has no access status.
  await expect(legRow(page, 0).locator(".leg-access-status")).toHaveCount(0);

  // The day row and the trip summary list the warning too.
  const day = daysPanel(page).getByRole("listitem").first();
  await expect(day.locator(".day-access-status")).toHaveText(
    strings.tripAccess.dayStatus(strings.accessState.forbidden),
  );
  await expect(day).toContainText("Ghent–Terneuzen canal");
  await expect(tripSummary(page)).toContainText(strings.tripAccess.summaryCount(1));
  await expect(tripSummary(page)).toContainText("Ghent–Terneuzen canal");
  await expect(tripSummary(page)).toContainText(strings.tripAccess.neverBlocks);

  // Warnings never block: saving and exporting still work, and so does editing.
  const [save] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.saveFileButton }).click(),
  ]);
  expect(save.suggestedFilename()).toMatch(/\.packraft\.json$/);
  const [gpx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.exportGpxButton }).click(),
  ]);
  expect(gpx.suggestedFilename()).toMatch(/\.zip$/);
  await legRow(page, 1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModeHike })
    .click();
  await expect(tripSummary(page)).toHaveCount(0);
  expect(network.blocked).toEqual([]);
});

test("an undated trip shows the rules in general terms", async ({ page }) => {
  await serveOffline(page);
  await seed(page);
  await page.goto("/");
  await expect(legRow(page, 1).locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusInGeneral(strings.accessState.forbidden),
  );
  await expect(legRow(page, 1)).toContainText("De Vlaamse Waterweg excludes the Ghent–Terneuzen canal");
});
