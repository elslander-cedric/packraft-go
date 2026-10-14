// #60: a paddle leg through a lock shows "lock at X: portage required" on the
// leg, the day and the trip summary; it never blocks. Uses the built-in data.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

// The Anderlecht lock is at 4.30174 E, 50.81956 N, on the Brussels canal (open).
const throughLock = [
  { lat: 50.8175, lng: 4.3005 },
  { lat: 50.8196, lng: 4.3017 },
  { lat: 50.8215, lng: 4.3028 },
];
// Further along the same canal, well away from any lock.
const awayFromLock = [
  { lat: 50.8265, lng: 4.3075 },
  { lat: 50.8275, lng: 4.3085 },
];

async function seed(page: Page, water: { lat: number; lng: number }[]) {
  const trip = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Canal",
      points: [water[0], water[water.length - 1]],
      legs: [{ mode: "paddle", route: { status: "routed", geometry: water.map((p) => ({ ...p, elevation: 5 })) } }],
      startDate: "2027-07-10",
    },
  };
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", save);
  }, JSON.stringify(trip));
}

const legRow = (page: Page) =>
  page.getByRole("complementary", { name: strings.legsPanelLabel }).locator(".leg-row").first();
const dayRow = (page: Page) =>
  page.getByRole("complementary", { name: strings.daysPanelLabel }).getByRole("listitem").first();
const tripSummary = (page: Page) => page.getByRole("region", { name: strings.tripAccess.summaryLabel });

test.use({ viewport: { width: 1400, height: 900 } });

test("a paddle leg through a lock shows the warning on the leg, the day and the trip; nothing is blocked", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, throughLock);
  await page.goto("/");

  const text = strings.tripAccess.lockWarning("Écluse d'Anderlecht - Sluis van Anderlecht");
  await expect(legRow(page).locator(".access-warning-lock")).toContainText(text);
  await expect(dayRow(page).locator(".access-warning-lock")).toContainText(text);
  await expect(tripSummary(page).locator(".access-warning-lock")).toContainText(text);
  await expect(tripSummary(page).locator(".access-status")).toHaveText(strings.tripAccess.summaryCount(1));
  await expect(tripSummary(page)).toContainText(strings.tripAccess.neverBlocks);
  // The warning is a lock's own, with its rule source.
  await expect(legRow(page).locator(".access-warning-lock").getByRole("link", { name: /Brussels police regulation/ })).toBeVisible();
});

test("a paddle leg away from any lock has no lock warning", async ({ page }) => {
  await serveOffline(page);
  await seed(page, awayFromLock);
  await page.goto("/");

  // Wait for the access content before checking what is absent.
  await expect(tripSummary(page).locator(".access-status")).toHaveText(strings.tripAccess.summaryNone);
  await expect(legRow(page).locator(".leg-access-status")).toBeVisible();
  await expect(page.locator(".access-warning-lock")).toHaveCount(0);
});
