// #60: a paddle leg through a lock shows "lock at X: portage required" on the
// leg, the day and the trip summary; it never blocks. Uses the built-in data.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { legDetailsDialog, openPlanner, showTab } from "./support/planner";

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
  page.getByRole("list", { name: strings.legsPanelLabel }).locator(".planner-row").first();
const legDetails = legDetailsDialog;
const dayRow = (page: Page) =>
  page.getByRole("complementary", { name: strings.daysPanelLabel }).getByRole("listitem").first();
const dayChip = (page: Page) =>
  dayRow(page).getByRole("group", { name: strings.tripAccess.dayWarningsLabel }).getByRole("button");
const showDays = (page: Page) => showTab(page, strings.planner.tabs.days);

test.use({ viewport: { width: 1400, height: 900 } });

test("a paddle leg through a lock shows the warning on the leg, and a Lock chip on its day", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, throughLock);
  await openPlanner(page);

  // The leg's details dialog (#158) holds the warning, a lock's own, with its rule source.
  const text = strings.tripAccess.lockWarning("Écluse d'Anderlecht - Sluis van Anderlecht");
  await legRow(page).getByRole("button", { name: strings.planner.legDetailsButton(1) }).click();
  await expect(legDetails(page).locator(".access-warning-lock")).toContainText(text);
  await expect(legDetails(page).locator(".access-warning-lock").getByRole("link", { name: /Brussels police regulation/ })).toBeVisible();
  await legDetails(page).getByRole("button", { name: strings.planner.legDetailsClose }).click();
  // The day only points at the leg (ADR 0029).
  await showDays(page);
  await expect(dayChip(page)).toContainText(strings.tripAccess.chipKind.lock);
  await expect(dayRow(page).locator(".access-warning-lock")).toHaveCount(0);
});

test("a paddle leg away from any lock has no lock warning", async ({ page }) => {
  await serveOffline(page);
  await seed(page, awayFromLock);
  await openPlanner(page);

  // Wait for the access content before checking what is absent.
  await expect(legRow(page).locator(".leg-access-icons")).toBeVisible();
  await expect(legRow(page).locator('svg[data-icon="stairs"]')).toHaveCount(0);
  await legRow(page).getByRole("button", { name: strings.planner.legDetailsButton(1) }).click();
  await expect(legDetails(page)).toBeVisible();
  await expect(page.locator(".access-warning-lock")).toHaveCount(0);
  await legDetails(page).getByRole("button", { name: strings.planner.legDetailsClose }).click();
  await showDays(page);
  await expect(dayChip(page)).toHaveCount(0);
});

test.describe("on the phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a paddle leg through a lock shows the lock icon on its row, once", async ({ page }) => {
    await serveOffline(page);
    await seed(page, throughLock);
    await page.goto("/");
    const sheet = page.getByRole("dialog", { name: strings.planner.sheetLabel });
    await sheet.getByRole("tab", { name: strings.planner.tabs.legs }).click();
    const icons = sheet.getByRole("list", { name: strings.legsPanelLabel }).getByRole("listitem").first().locator(".leg-access-icons");
    await expect(icons.locator('svg[data-icon="stairs"]')).toHaveCount(1);
    await expect(icons).toContainText(strings.tripAccess.chipKind.lock);
  });
});
