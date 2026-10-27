// The phone planner's Days, Trip and Settings tabs (#123, ADR 0026): day cards that
// zoom the map to their day and carry its access, the trip's name and start date, and the
// planner's settings stored on the device. The trip is seeded in browser storage with
// routed legs, so nothing is routed: a hike to the Meuse at Dinant, a camp, then a
// paddle leg on the Meuse (unlisted Walloon water: not allowed, #75).
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
// Dates are picked in Brussels: none may move a day (CLAUDE.md).
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, timezoneId: "Europe/Brussels" });

const text = strings.phone;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });
const panel = (page: Page) => sheet(page).getByRole("tabpanel");
const dayCards = (page: Page) =>
  sheet(page).getByRole("complementary", { name: strings.daysPanelLabel }).getByRole("listitem");
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const tripName = (page: Page) => panel(page).getByLabel(strings.tripNameLabel);
const startDate = (page: Page) => panel(page).getByLabel(strings.startDateLabel);
const clearDate = (page: Page) => panel(page).getByRole("button", { name: strings.clearStartDateButton });
const paceFactor = (page: Page) => panel(page).getByLabel(strings.paceFactorLabel);
const paddleSpeed = (page: Page) => panel(page).getByLabel(strings.paddleSpeedLabel);
const totals = (page: Page) => sheet(page).locator(".phone-totals");

const START = { lat: 50.25, lng: 4.85 };
const DINANT = [
  { lat: 50.26, lng: 4.91 },
  { lat: 50.265, lng: 4.915 },
];

const routed = (points: { lat: number; lng: number }[], from: number) => ({
  status: "routed",
  geometry: points.map((p, i) => ({ ...p, elevation: from + 20 * i })),
});

const TWO_DAYS = {
  format: "packraft-go-trip",
  version: 1,
  trip: {
    name: "Dinant weekend",
    points: [START, DINANT[0], DINANT[1]],
    legs: [
      { mode: "hike", route: routed([START, { lat: 50.255, lng: 4.88 }, DINANT[0]], 100) },
      { mode: "paddle", route: routed(DINANT, 90) },
    ],
    camps: [1],
  },
};

/** Seeds the trip before the first load only, so reloads keep the app's own saves. */
async function openWithTrip(page: Page) {
  await page.addInitScript(
    ([key, save]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(key, save);
    },
    [TRIP_KEY, JSON.stringify(TWO_DAYS)] as const,
  );
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(points(page)).toHaveCount(3);
}

const storedTrip = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), TRIP_KEY);

/**
 * Whether a point is drawn whole in the part of the map the sheet leaves free.
 * (Leaflet squashes a point far off screen onto the map's edge.)
 */
async function inView(page: Page, shape: Locator) {
  const box = await shape.boundingBox();
  if (!box) return false;
  const map = (await mapRegion(page).boundingBox())!;
  const top = (await sheet(page).boundingBox())!.y;
  return box.x > map.x && box.x + box.width < map.x + map.width && box.y > map.y && box.y + box.height < top;
}

/** Minutes in a shown time such as "1 h 13 min" or "49 min". */
function minutes(shown: string): number {
  const m = shown.match(/(?:(\d+) h )?(\d+) min/);
  if (!m) throw new Error(`no time in "${shown}"`);
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

test("a two-day trip shows two day cards with their figures; tapping a card zooms the map to that day", async ({ page }) => {
  await serveOffline(page);
  await openWithTrip(page);
  await tab(page, text.tabs.days).click();

  await expect(dayCards(page)).toHaveCount(2);
  await expect(dayCards(page).nth(0)).toContainText(strings.dayLabel(1));
  await expect(dayCards(page).nth(0)).toContainText(strings.dayHikeDistance);
  await expect(dayCards(page).nth(0)).toContainText(strings.climbLabel);
  await expect(dayCards(page).nth(0)).toContainText(strings.dayTimeEstimate);
  await expect(dayCards(page).nth(1)).toContainText(strings.dayPaddleDistance);
  // The paddle day is on unlisted Walloon water: not allowed, never "unknown" (#75).
  await expect(dayCards(page).nth(1)).toContainText(strings.tripAccess.dayStatus(strings.accessState.forbidden));

  await dayCards(page).nth(1).tap();
  await expect.poll(() => inView(page, points(page).nth(1))).toBe(true);
  await expect.poll(() => inView(page, points(page).nth(2))).toBe(true);
  await expect.poll(() => inView(page, points(page).nth(0))).toBe(false);

  await dayCards(page).nth(0).tap();
  await expect.poll(() => inView(page, points(page).nth(0))).toBe(true);
  await expect.poll(() => inView(page, points(page).nth(1))).toBe(true);
});

test("the Days tab has no heading or rule of its own; the cards run edge to edge right under the tab row", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  await tab(page, text.tabs.days).click();
  await expect(dayCards(page)).toHaveCount(2);

  // The tab already names the panel.
  await expect(panel(page).getByRole("heading", { name: strings.daysPanelLabel })).toHaveCount(0);
  const days = sheet(page).getByRole("complementary", { name: strings.daysPanelLabel });
  await expect(days).toHaveCSS("border-top-width", "0px");

  // Polled: the sheet may still be settling at its stop.
  await expect
    .poll(async () => {
      const sheetBox = (await sheet(page).boundingBox())!;
      const tabsBox = (await sheet(page).getByRole("tablist").boundingBox())!;
      const cardBox = (await dayCards(page).nth(0).boundingBox())!;
      return [
        Math.round(cardBox.x - sheetBox.x),
        Math.round(sheetBox.x + sheetBox.width - (cardBox.x + cardBox.width)),
        Math.round(cardBox.y - (tabsBox.y + tabsBox.height)),
      ];
    })
    .toEqual([0, 0, 0]);

  // Like the leg rows: the cards touch, with a rule between them.
  const first = (await dayCards(page).nth(0).boundingBox())!;
  const second = (await dayCards(page).nth(1).boundingBox())!;
  expect(Math.round(second.y - (first.y + first.height))).toBe(0);
  await expect(dayCards(page).nth(0)).toHaveCSS("border-bottom-width", "1px");
});

test("the Settings tab has no heading, rule or padding of its own; its fields line up with the Trip tab's", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  const fieldBox = async (tabName: string, field: (page: Page) => Locator) => {
    await tab(page, tabName).click();
    // Polled: the sheet may still be settling at its stop.
    let box = (await field(page).boundingBox())!;
    await expect
      .poll(async () => {
        const previous = box;
        box = (await field(page).boundingBox())!;
        return [box.x - previous.x, box.y - previous.y];
      })
      .toEqual([0, 0]);
    return box;
  };
  const trip = await fieldBox(text.tabs.trip, tripName);
  const settings = await fieldBox(text.tabs.settings, paceFactor);

  // The tab already names the panel.
  await expect(panel(page).getByRole("heading", { name: strings.settingsPanelLabel })).toHaveCount(0);
  await expect(panel(page).getByRole("region", { name: strings.settingsPanelLabel })).toHaveCSS(
    "border-top-width",
    "0px",
  );
  expect(Math.round(settings.x)).toBe(Math.round(trip.x));
});

test("the Trip tab renames the trip and sets, changes and clears its start date; all autosaved, no date drift", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  await tab(page, text.tabs.trip).click();

  await expect(tripName(page)).toHaveValue("Dinant weekend");
  await tripName(page).fill("Meuse & Lesse");
  await expect(sheet(page).getByRole("heading", { name: "Meuse & Lesse" })).toBeVisible();
  await expect.poll(async () => (await storedTrip(page)).trip.name).toBe("Meuse & Lesse");

  await expect(startDate(page)).toHaveValue("");
  await expect(clearDate(page)).toHaveCount(0);
  await startDate(page).fill("2026-10-31");
  await expect.poll(async () => (await storedTrip(page)).trip.startDate).toBe("2026-10-31");
  await tab(page, text.tabs.days).click();
  await expect(dayCards(page).nth(0)).toContainText("Sat 31 Oct 2026");
  await expect(dayCards(page).nth(1)).toContainText("Sun 1 Nov 2026");

  await tab(page, text.tabs.trip).click();
  await startDate(page).fill("2027-07-10");
  await page.reload();
  await tab(page, text.tabs.trip).click();
  await expect(startDate(page)).toHaveValue("2027-07-10");
  await expect(tripName(page)).toHaveValue("Meuse & Lesse");
  await tab(page, text.tabs.days).click();
  await expect(dayCards(page).nth(0)).toContainText("Sat 10 Jul 2027");
  await expect(dayCards(page).nth(1)).toContainText("Sun 11 Jul 2027");

  await tab(page, text.tabs.trip).click();
  await clearDate(page).click();
  await expect(startDate(page)).toHaveValue("");
  await expect.poll(async () => (await storedTrip(page)).trip.startDate).toBeUndefined();
  await tab(page, text.tabs.days).click();
  await expect(dayCards(page)).toHaveCount(2);
  await expect(dayCards(page).nth(1)).not.toContainText("Jul");
});

test("the Trip tab has no access summary or totals: each day's access is on its card, the disclaimer under them", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  await tab(page, text.tabs.trip).click();
  await expect(tripName(page)).toBeVisible();
  await expect(panel(page).getByRole("region", { name: strings.tripAccess.summaryLabel })).toHaveCount(0);
  await expect(panel(page)).not.toContainText(strings.navigationRulesNotice);
  // The totals are in the peek only.
  const total = (await totals(page).textContent())!;
  expect(total).toContain(strings.kilometreUnit);
  await expect(panel(page)).not.toContainText(strings.tripTotalTimeEstimate);

  await tab(page, text.tabs.days).click();
  // Unlisted Walloon water is not allowed (#75): a Forbidden status, never "unknown".
  await expect(dayCards(page).nth(1)).toContainText(strings.tripAccess.dayStatus(strings.accessState.forbidden));
  await expect(dayCards(page).nth(1)).toContainText(strings.tripAccess.warningKind.forbidden);
  await expect(panel(page)).not.toContainText(strings.accessState.unknown);
  const disclaimer = panel(page).getByText(strings.navigationRulesNotice);
  await expect(disclaimer).toBeVisible();
  const [lastCard, below] = await Promise.all([dayCards(page).nth(1).boundingBox(), disclaimer.boundingBox()]);
  expect(below!.y).toBeGreaterThan(lastCard!.y + lastCard!.height);
});

test("pace and paddling speed change the time estimates, survive a reload and are not in the trip", async ({ page }) => {
  await serveOffline(page);
  await openWithTrip(page);
  await tab(page, text.tabs.settings).click();
  await expect(paceFactor(page)).toHaveValue("1");
  await expect(paddleSpeed(page)).toHaveValue("5");
  const before = minutes((await totals(page).textContent())!);

  await paceFactor(page).fill("2");
  await expect.poll(async () => minutes((await totals(page).textContent())!)).toBeGreaterThan(before);
  const slower = minutes((await totals(page).textContent())!);
  await paddleSpeed(page).fill("2.5");
  await expect.poll(async () => minutes((await totals(page).textContent())!)).toBeGreaterThan(slower);

  await page.reload();
  await tab(page, text.tabs.settings).click();
  await expect(paceFactor(page)).toHaveValue("2");
  await expect(paddleSpeed(page)).toHaveValue("2.5");
  const settings = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
  expect(settings).toContain("2.5");
  const trip = JSON.stringify(await storedTrip(page));
  expect(trip).not.toMatch(/pace|paddleSpeed/i);
});

test.describe("on a narrow phone", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("each day figure stays on one line", async ({ page }) => {
    await serveOffline(page);
    await openWithTrip(page);
    await page.evaluate(() => document.fonts.ready);
    await tab(page, text.tabs.days).click();
    const card = dayCards(page).nth(0);
    const figures = card.locator(":scope > span:not(.day-heading)");
    await expect(figures.first()).toBeVisible();
    for (const figure of await figures.all()) {
      const lines = await figure.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      });
      expect(lines, (await figure.textContent()) ?? "").toBe(1);
    }
  });
});
