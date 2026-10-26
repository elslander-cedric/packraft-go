// The phone planner's sheet header and chrome after the first try on an Android phone:
// the bottom buttons sit above the sheet, the selected tab stands out, the header shows
// the trip name (if any) above the totals by mode with climb and descent, the tab content
// starts below the tab row, and there is no "Indicative only" banner over the map (ADR 0026).
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.phone;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });
const totals = (page: Page) => sheet(page).locator(".phone-totals");
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
  // The disclaimer is in the access popover and the Trip tab only (ADR 0026), not a line over the map.
  await expect(page.getByRole("note")).toBeHidden();
  await expect(page.getByText(strings.navigationRulesNotice)).toBeHidden();
});

test("a named trip shows its name with the totals below: hike, paddle, climb, descent and time", async ({ page }) => {
  await serveOffline(page);
  await open(page, hikeAndPaddle("Dinant weekend"));
  await expect(points(page)).toHaveCount(3);

  const name = sheet(page).getByRole("heading", { name: "Dinant weekend" });
  await expect(name).toBeVisible();
  const figures = totals(page).locator(".phone-total");
  await expect(figures).toHaveCount(5);
  const { glyphs, labels } = text.totals;
  for (const [i, key] of (["hike", "paddle", "climb", "descent", "time"] as const).entries()) {
    await expect(figures.nth(i)).toContainText(glyphs[key]);
    await expect(figures.nth(i)).toContainText(labels[key]);
  }
  await expect(figures.nth(2)).toContainText(`75 ${strings.metreUnit}`);
  await expect(figures.nth(3)).toContainText(`85 ${strings.metreUnit}`);
  // The totals are below the name, not beside it (measured in one go: the sheet may still be sliding in).
  const below = await sheet(page).evaluate(
    (el) =>
      el.querySelector(".phone-totals")!.getBoundingClientRect().top >=
      el.querySelector("h2")!.getBoundingClientRect().bottom - 1,
  );
  expect(below).toBe(true);
});

test("a trip with no paddle legs leaves the paddle figure out; with no name only the totals show", async ({ page }) => {
  await serveOffline(page);
  const save = hikeAndPaddle("   ");
  save.trip.points = save.trip.points.slice(0, 2);
  save.trip.legs = save.trip.legs.slice(0, 1);
  await open(page, save);
  await expect(points(page)).toHaveCount(2);

  await expect(sheet(page).getByRole("heading")).toHaveCount(0);
  await expect(totals(page).locator(".phone-total")).toHaveCount(4);
  await expect(totals(page)).not.toContainText(text.totals.glyphs.paddle);
  await expect(totals(page)).toContainText(text.totals.glyphs.hike);
});

test("a long trip name stays on one line and the totals wrap, with the tab row still in the peek", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await serveOffline(page);
  await open(page, hikeAndPaddle("A very long trip name for a week on the Lesse, the Meuse and the Semois"));
  await expect(points(page)).toHaveCount(3);
  await settled(page);

  const name = sheet(page).getByRole("heading");
  expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth && el.clientHeight < 40)).toBe(true);
  // No figure breaks inside or spills out of the screen.
  for (const figure of await totals(page).locator(".phone-total").all()) {
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

test("the leg and day lists sit right under the tab row; every other tab's content starts with some space", async ({
  page,
}) => {
  // The lists run edge to edge, like the tab row itself.
  const flush: string[] = [text.tabs.legs, text.tabs.days];
  await serveOffline(page);
  await open(page, hikeAndPaddle("Dinant weekend"));
  for (const name of Object.values(text.tabs)) {
    await tab(page, name).click();
    await settled(page);
    // Measured in one go: the panel's content re-renders as the tab opens.
    const gap = await sheet(page).evaluate((el) => {
      const tabs = el.querySelector('[role="tablist"]')!.getBoundingClientRect();
      const first = el.querySelector('[role="tabpanel"]:not([hidden]) > *')!.getBoundingClientRect();
      return first.top - tabs.bottom;
    });
    if (flush.includes(name)) expect(Math.round(gap), name).toBe(0);
    else expect(gap, name).toBeGreaterThanOrEqual(12);
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
