// #78: unknown access is a gentle note, not a warning. Trips are seeded in browser
// storage; the Netherlands has no access rules, the Ghent–Terneuzen canal is forbidden.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { legDetailsDialog, openPlanner, showTab } from "./support/planner";

type P = { lat: number; lng: number };
const canal: P[] = [
  { lat: 51.08505, lng: 3.72577 },
  { lat: 51.09192, lng: 3.72955 },
];
const netherlands: P[] = [
  { lat: 52.37, lng: 4.89 },
  { lat: 52.372, lng: 4.9 },
];

const routed = (points: P[]) => ({ status: "routed", geometry: points.map((p) => ({ ...p, elevation: 5 })) });

/** Seeds a trip of paddle legs (each on its own water), joined by short hike legs. */
async function seed(page: Page, waters: P[][]) {
  const points: P[] = [];
  const legs: unknown[] = [];
  waters.forEach((water, i) => {
    if (i > 0) legs.push({ mode: "hike", route: routed([points[points.length - 1], water[0]]) });
    points.push(water[0]);
    legs.push({ mode: "paddle", route: routed(water) });
    points.push(water[water.length - 1]);
  });
  const save = { format: "packraft-go-trip", version: 1, trip: { name: "Trip", points, legs, startDate: "2027-07-10" } };
  await page.addInitScript((json) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", json);
  }, JSON.stringify(save));
}

const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
/** The Days tab's warning chips; shows the tab first. */
const dayChips = async (page: Page) => {
  await showTab(page, strings.phone.tabs.days);
  return page
    .getByRole("complementary", { name: strings.daysPanelLabel })
    .getByRole("group", { name: strings.tripAccess.dayWarningsLabel })
    .getByRole("button");
};
const legDetails = legDetailsDialog;

test.use({ viewport: { width: 1400, height: 900 } });

test("a leg in the Netherlands shows a neutral note and its day gets no warning chip (#78)", async ({ page }) => {
  await serveOffline(page);
  await seed(page, [netherlands]);
  await openPlanner(page);

  const leg = legsPanel(page).locator(".phone-row").first();
  // Wait for the access to render before checking what is absent.
  await expect(leg.locator(".leg-access-icons")).toContainText(strings.accessState.unknown);
  // The note is in the leg's details dialog (#158).
  await leg.getByRole("button", { name: strings.phone.legDetailsButton(1) }).click();
  await expect(legDetails(page).locator(".access-note")).toHaveText(strings.tripAccess.noRule);
  await expect(legDetails(page).locator(".access-warning")).toHaveCount(0);
  await legDetails(page).getByRole("button", { name: strings.phone.legDetailsClose }).click();

  await expect(await dayChips(page)).toHaveCount(0);
});

test("a trip with a forbidden leg and an unknown leg gets exactly one warning chip (#78)", async ({ page }) => {
  await serveOffline(page);
  await seed(page, [canal, netherlands]);
  await openPlanner(page);

  // Wait for the access before counting chips.
  await expect(legsPanel(page).locator(".leg-access-icons").first()).toBeVisible();
  await expect(await dayChips(page)).toHaveCount(1);
  await expect(await dayChips(page)).toContainText(strings.tripAccess.chipKind.forbidden);
});
