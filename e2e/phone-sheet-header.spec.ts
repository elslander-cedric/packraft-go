// The phone planner's sheet header and chrome after the first try on an Android phone:
// the bottom buttons sit above the sheet, the selected tab stands out, the header shows
// the totals by mode with climb and descent (the trip name is in Trip details, #154), the tab content
// starts below the tab row, and there is no "Indicative only" banner over the map (ADR 0026).
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { icons } from "../src/ui/icons/icons";
import { strings } from "../src/ui/strings";
import { iconIn } from "./support/icons";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.planner;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });
const totals = (page: Page) => sheet(page).locator(".planner-totals");
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");

const START = { lat: 50.25, lng: 4.85 };
const DINANT = [
  { lat: 50.26, lng: 4.91 },
  { lat: 50.265, lng: 4.915 },
];
const routed = (points: { lat: number; lng: number }[], elevations: number[]) => ({
  status: "routed",
  geometry: points.map((p, i) => ({ ...p, elevation: elevations[i] })),
});
/** A hike that climbs and descends to the Meuse, then a paddle leg on it. */
const hikeAndPaddle = (name: string) => ({
  format: "packraft-go-trip",
  version: 1,
  trip: {
    name,
    points: [START, DINANT[0], DINANT[1]],
    legs: [
      { mode: "hike", route: routed([START, { lat: 50.255, lng: 4.88 }, DINANT[0]], [100, 180, 90]) },
      { mode: "paddle", route: routed(DINANT, [90, 88]) },
    ],
  },
});

async function open(page: Page, save?: object) {
  if (save)
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, JSON.stringify(save)] as const);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/** Waits until nothing on the page is animating (the sheet sliding in or rising). */
const settled = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

const box = async (locator: Locator) => (await locator.boundingBox())!;

test("an unnamed, empty trip shows no name and no totals; there's no disclaimer banner over the map", async ({
  page,
}) => {
  await serveOffline(page);
  await open(page);

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("heading")).toHaveCount(0);
  await expect(sheet(page)).not.toContainText(strings.tripNamePlaceholder);
  await expect(totals(page)).toHaveCount(0);
  // The disclaimer is in the access dialog only (ADR 0026), not a line over the map.
  await expect(page.getByRole("note")).toBeHidden();
  await expect(page.getByText(strings.navigationRulesNotice)).toBeHidden();
});

test("the header shows the totals, not the trip name: hike, paddle, climb, descent and time", async ({ page }) => {
  await serveOffline(page);
  await open(page, hikeAndPaddle("Dinant weekend"));
  await expect(points(page)).toHaveCount(3);

  // The name is in Trip details only (#154).
  await expect(sheet(page).getByRole("heading")).toHaveCount(0);
  await expect(sheet(page)).not.toContainText("Dinant weekend");
  const figures = totals(page).locator(".planner-total");
  await expect(figures).toHaveCount(5);
  const { labels } = text.totals;
  for (const [i, key] of (["hike", "paddle", "climb", "descent", "time"] as const).entries()) {
    await expect(iconIn(figures.nth(i), icons[key])).toBeVisible();
    await expect(figures.nth(i)).toContainText(labels[key]);
  }
  await expect(figures.nth(2)).toContainText(`75 ${strings.metreUnit}`);
  await expect(figures.nth(3)).toContainText(`85 ${strings.metreUnit}`);
});

test("on a phone, all five totals fit on one line", async ({ page }) => {
  await serveOffline(page);
  await open(page, hikeAndPaddle("Dinant weekend"));
  await expect(points(page)).toHaveCount(3);
  await settled(page);

  const figures = totals(page).locator(".planner-total");
  await expect(figures).toHaveCount(5);
  const tops = await figures.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("a trip with no paddle legs leaves the paddle figure out", async ({ page }) => {
  await serveOffline(page);
  const save = hikeAndPaddle("   ");
  save.trip.points = save.trip.points.slice(0, 2);
  save.trip.legs = save.trip.legs.slice(0, 1);
  await open(page, save);
  await expect(points(page)).toHaveCount(2);

  await expect(totals(page).locator(".planner-total")).toHaveCount(4);
  await expect(iconIn(totals(page), icons.paddle)).toHaveCount(0);
  await expect(iconIn(totals(page), icons.hike)).toBeVisible();
  await expect(totals(page)).not.toContainText(text.totals.labels.paddle);
});

test("on a narrow phone the totals wrap, with the tab row still in the peek", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await serveOffline(page);
  await open(page, hikeAndPaddle("A very long trip name for a week on the Lesse, the Meuse and the Semois"));
  await expect(points(page)).toHaveCount(3);
  await settled(page);

  // No figure breaks inside or spills out of the screen.
  for (const figure of await totals(page).locator(".planner-total").all()) {
    const { x, width, height } = await box(figure);
    expect(height).toBeLessThan(30);
    expect(x + width).toBeLessThanOrEqual(320);
  }
  // The tab row is fully on screen at the peek.
  const tabs = await box(sheet(page).getByRole("tablist"));
  expect(tabs.y + tabs.height).toBeLessThanOrEqual(640);
  // The peek grew to fit, and the bottom buttons moved up with it.
  const undo = await box(page.getByRole("button", { name: strings.undoButton }));
  expect(undo.y + undo.height).toBeLessThanOrEqual((await box(sheet(page))).y);
});

test("the selected tab looks different from the others", async ({ page }) => {
  await serveOffline(page);
  await open(page);

  const style = (name: string) =>
    tab(page, name).evaluate((el) => {
      const s = getComputedStyle(el);
      return { weight: s.fontWeight, border: s.borderBottomColor, color: s.color };
    });
  const legs = await style(text.tabs.legs);
  const days = await style(text.tabs.days);
  expect(legs.weight).not.toBe(days.weight);
  expect(legs.border).not.toBe(days.border);
  expect(legs.color).not.toBe(days.color);

  await tab(page, text.tabs.days).click();
  await expect.poll(() => style(text.tabs.days)).toEqual(legs);
});

test("the leg, section and day lists sit right under the tab row; every other tab's content starts with some space", async ({
  page,
}) => {
  // The lists run edge to edge, like the tab row itself.
  const flush: string[] = [text.tabs.legs, text.tabs.sections, text.tabs.days];
  await serveOffline(page);
  await open(page, hikeAndPaddle("Dinant weekend"));
  for (const name of Object.values(text.tabs)) {
    await tab(page, name).click();
    await settled(page);
    // Measured in one go, polled: the panel's content re-renders as the tab opens, and right
    // after Days the flush Days panel may still be the one shown.
    const gap = () =>
      sheet(page).evaluate((el) => {
        const tabs = el.querySelector('[role="tablist"]')!.getBoundingClientRect();
        const first = el.querySelector('[role="tabpanel"]:not([hidden]) > *')!.getBoundingClientRect();
        return Math.round(first.top - tabs.bottom);
      });
    if (flush.includes(name)) await expect.poll(gap, { message: name }).toBe(0);
    else await expect.poll(gap, { message: name }).toBeGreaterThanOrEqual(12);
  }
});

test("the bottom-left and bottom-right buttons are fully on screen, above the sheet", async ({ page }) => {
  await serveOffline(page);
  await open(page);
  await settled(page);

  // The app fills the visible screen (dvh, not vh: on Android Chrome vh counts the area behind the toolbar).
  const app = await page.locator(".app").evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(app - page.viewportSize()!.height)).toBeLessThan(1);

  const sheetTop = (await box(sheet(page))).y;
  for (const name of [text.markAccessPointButton, strings.undoButton]) {
    const button = await box(page.getByRole("button", { name }));
    expect(button.y, name).toBeGreaterThanOrEqual(0);
    expect(button.y + button.height, name).toBeLessThanOrEqual(sheetTop);
  }
});
