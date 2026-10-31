// The Sections tab (GLOSSARY: Section, ADR 0021): one row per section between the Legs and Days
// tabs, like a leg row with the totals of its legs. Its warnings are its legs' (ADR 0029).
import { expect, test, type Page } from "@playwright/test";
import { icons } from "../src/ui/icons/icons";
import { strings } from "../src/ui/strings";
import { iconIn } from "./support/icons";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { figure, legRowButton, legRows, mapRegion, openPlanner, panelTab, showTab, tripPanel } from "./support/planner";

const text = strings.planner;
const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

type Point = { lat: number; lng: number; elevation?: number };
type SeedLeg = { mode: "hike" | "paddle"; line?: readonly Point[] };

// On the Brussels canal; the Anderlecht lock is at the second point of the first paddle leg.
const A = { lat: 50.8175, lng: 4.3005, elevation: 30 };
const LOCK = { lat: 50.8196, lng: 4.3017, elevation: 26 };
const B = { lat: 50.8215, lng: 4.3028, elevation: 24 };
const C = { lat: 50.8265, lng: 4.3075, elevation: 20 };
const D = { lat: 50.8275, lng: 4.3085, elevation: 20 };
const E = { lat: 50.8285, lng: 4.3095, elevation: 20 };

async function seed(page: Page, trip: { points: readonly Point[]; legs: readonly SeedLeg[]; camps?: readonly number[] }) {
  const save = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Sections",
      points: trip.points.map(({ lat, lng }) => ({ lat, lng })),
      legs: trip.legs.map(({ mode, line }) => ({
        mode,
        ...(line && { route: { status: "routed", geometry: line.map((p) => ({ elevation: 20, ...p })) } }),
      })),
      ...(trip.camps && { camps: trip.camps }),
      startDate: "2027-07-10",
    },
  });
  await page.addInitScript((tripSave) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", tripSave);
  }, save);
}

// A hike, then two paddle legs (one through the lock), then a camp and a third paddle leg.
const canalTrip = {
  points: [D, A, B, C, E],
  legs: [
    { mode: "hike", line: [D, A] },
    { mode: "paddle", line: [A, LOCK, B] },
    { mode: "paddle", line: [B, C] },
    { mode: "paddle", line: [C, E] },
  ],
  camps: [3],
} as const;

const sectionRows = (page: Page) =>
  tripPanel(page).getByRole("list", { name: strings.sectionsPanelLabel }).getByRole("listitem");
const sectionDialog = (page: Page) => page.getByRole("dialog", { name: /^Section \d+ · / });
const showSections = (page: Page) => showTab(page, text.tabs.sections);

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

test("the Sections tab sits between Legs and Days", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  await expect(tripPanel(page).getByRole("tab")).toHaveText([
    text.tabs.legs,
    text.tabs.sections,
    text.tabs.days,
    text.tabs.accessPoints,
  ]);
  await showSections(page);
  await expect(tripPanel(page).getByText(strings.sectionsPanelEmpty)).toBeVisible();
});

test("a row per section, ending at a mode change or a camp, with the totals of its legs", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await showSections(page);

  await expect(sectionRows(page)).toHaveCount(3);
  const paddle = sectionRows(page).nth(1);
  await expect(sectionRows(page).nth(0)).toContainText(strings.legRange(1, 1));
  await expect(paddle).toContainText(strings.legRange(2, 3));
  await expect(sectionRows(page).nth(2)).toContainText(strings.legRange(4, 4));
  await expect(iconIn(paddle, icons.paddle)).toBeVisible();

  // Net drop from the first put-in to the last take-out: 30 m to 20 m.
  expect(await figure(paddle, text.legFigures.drop)).toBe("10 m");
  await showTab(page, text.tabs.legs);
  await expect(legRows(page)).toHaveCount(4);
});

test("a section shows its legs' warnings on the row, and each leg's details in a dialog", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await showSections(page);

  const paddle = sectionRows(page).nth(1);
  await expect(paddle.locator('svg[data-icon="stairs"]')).toHaveCount(1);
  await expect(sectionRows(page).nth(0).getByRole("button", { name: text.sectionDetailsButton(1) })).toHaveCount(0);

  await paddle.getByRole("button", { name: text.sectionDetailsButton(2) }).click();
  const dialog = sectionDialog(page);
  await expect(dialog.getByRole("heading", { name: strings.legLabel(2), exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: strings.legLabel(3), exact: true })).toBeVisible();
  await expect(dialog.locator(".access-warning-lock")).toHaveCount(1);
  await expect(dialog.locator(".access-warning-lock")).toContainText(
    strings.tripAccess.lockWarning("Écluse d'Anderlecht - Sluis van Anderlecht"),
  );
  await dialog.getByRole("button", { name: text.legDetailsClose }).click();
  await expect(sectionDialog(page)).toHaveCount(0);
});

test("tapping a row zooms the map to the section and marks it, apart from the Legs tab's selection", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);

  await legRowButton(page, 1).click();
  await showSections(page);
  const button = sectionRows(page).nth(1).getByRole("button", { name: strings.sectionLabel(2), exact: false }).first();
  await expect(button).not.toHaveAttribute("aria-current");
  const pane = mapRegion(page).locator(".leaflet-map-pane");
  const before = await pane.evaluate((el) => (el as HTMLElement).style.transform);
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "true");
  await expect.poll(() => pane.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);
  await expect(sectionRows(page).locator('.planner-row-toggle[aria-current]')).toHaveCount(1);
});

test("a section whose legs are waiting for routes says so once", async ({ page }) => {
  await serveOffline(page, { brouter: () => new Promise<BRouterReply>(() => {}) });
  await seed(page, { points: [D, A, B], legs: [{ mode: "hike" }, { mode: "hike" }] });
  await openPlanner(page);
  await showSections(page);
  await expect(sectionRows(page).first().getByRole("status")).toHaveText(strings.legRouting);
});

test("each failed leg shows by number with its own Retry", async ({ page }) => {
  let up = false;
  const network = await serveOffline(page, { brouter: () => (up ? TRAIL : { status: 503, body: "" }) });
  await seed(page, { points: [D, A, B, C], legs: [{ mode: "hike" }, { mode: "hike", line: [A, B] }, { mode: "hike" }] });
  await openPlanner(page);
  await showSections(page);

  const row = sectionRows(page).first();
  await expect(row.getByRole("alert")).toHaveText([
    text.sectionLegFailed(1, strings.legRouteFailed.unavailable),
    text.sectionLegFailed(3, strings.legRouteFailed.unavailable),
  ]);
  up = true;
  const asked = network.brouter.length;
  await row.getByRole("button", { name: strings.retryRouting }).first().click();
  await expect(row.getByRole("alert")).toHaveText([text.sectionLegFailed(3, strings.legRouteFailed.unavailable)]);
  expect(network.brouter.length).toBe(asked + 1);
});

test.describe("on a 320 px phone", () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });

  test("the four tabs fit side by side, and no label is cut off (#70)", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const sheet = page.getByRole("dialog", { name: text.sheetLabel });
    const tabs = sheet.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    for (const tab of await tabs.all()) {
      await expect(tab).toBeInViewport({ ratio: 1 });
      const fits = await tab.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits).toBe(true);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("the tab keeps its name for screen readers", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  await expect(panelTab(page, text.tabs.sections)).toBeVisible();
  await expect(tripPanel(page).getByRole("tablist", { name: text.tabsLabel })).toBeVisible();
});
