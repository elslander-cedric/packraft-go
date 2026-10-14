// #78: unknown access is a gentle note, not a warning. Trips are seeded in browser
// storage; the Netherlands has no access rules, the Ghent–Terneuzen canal is forbidden.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

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

const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const tripSummary = (page: Page) => page.getByRole("region", { name: strings.tripAccess.summaryLabel });

test.use({ viewport: { width: 1400, height: 900 } });

test("a leg in the Netherlands shows a neutral note and the trip summary shows no warning for it (#78)", async ({ page }) => {
  await serveOffline(page);
  await seed(page, [netherlands]);
  await page.goto("/");

  const leg = legsPanel(page).locator(".leg-row").first();
  // Wait for the access text to render before checking what is absent.
  await expect(leg.locator(".leg-access-status")).toContainText(strings.accessState.unknown);
  await expect(leg.locator(".access-note")).toHaveText(strings.tripAccess.noRule);
  await expect(leg.locator(".access-warning")).toHaveCount(0);

  await expect(tripSummary(page)).toContainText(strings.tripAccess.summaryNone);
  await expect(tripSummary(page)).toContainText(strings.tripAccess.legsWithoutRules(1));
  await expect(tripSummary(page).locator(".access-warning")).toHaveCount(0);
});

test("a trip with a forbidden leg and an unknown leg shows exactly one warning (#78)", async ({ page }) => {
  await serveOffline(page);
  await seed(page, [canal, netherlands]);
  await page.goto("/");

  const summary = tripSummary(page);
  await expect(summary).toContainText(strings.tripAccess.summaryCount(1));
  await expect(summary).toContainText(strings.tripAccess.legsWithoutRules(1));
  await expect(summary.locator(".access-warning")).toHaveCount(1);
  await expect(summary.locator(".access-warning")).toContainText(strings.tripAccess.warningKind.forbidden);
});
