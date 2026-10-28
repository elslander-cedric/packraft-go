// The access layer on the phone (#125, ADR 0026, stories 74–81): a layers button under the position button,
// a chip with a dialog for the date, legend, note and disclaimer; a tap on water edits the
// route, holding a water off a leg (0.4 s, the app's own timer) or tapping a lock opens its
// details in the sheet at half, with Close back to the tab. Built-in data and recorded
// fixtures only; no live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { touch, type Pixel } from "./support/touch";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const phoneText = strings.phone;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const waters = (page: Page) => mapRegion(page).locator("path.access-feature");
const water = (page: Page, id: string) => mapRegion(page).locator(`path.access-record-${id}`);
const lock = (page: Page, id: string) => mapRegion(page).locator(`path.access-lock-${id}`);
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const layersButton = (page: Page) => page.getByRole("button", { name: strings.accessLayerToggle, exact: true });
const chip = (page: Page) => page.getByRole("button", { name: /^Access · / });
// Behind the access dialog, which hides the rest of the page from the accessibility tree while open.
const waterBehind = (page: Page, id: string) => page.locator(`.leaflet-container path.access-record-${id}`);
const chipBehind = (page: Page) => page.locator(".phone-access-chip");
const accessDialog = (page: Page) => page.getByRole("dialog", { name: phoneText.accessDialogTitle });
const sheet = (page: Page) => page.getByRole("dialog", { name: phoneText.sheetLabel });
const waterDetails = (page: Page) => sheet(page).getByRole("region", { name: strings.accessDetailLabel });
const lockDetails = (page: Page) => sheet(page).getByRole("region", { name: strings.lockDetailLabel });
const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });

// The Lesse from Daverdisse to Chanly (Walloon category 1.C): open 1 October to 15 March.
const LESSE = "walloon-1C2a";
const ORANGE = "#e07b00"; // closed today
const GREEN = "#1f9d55"; // open
// The Anderlecht lock on the Brussels canal.
const ANDERLECHT_LOCK = "lock-way-580151104";

/** A hike leg north of the Lesse stretch, so the stretch's middle is off the leg. */
const nearLesse: Trip = {
  name: "",
  startDate: "2026-12-15",
  points: [
    { lat: 50.085, lng: 5.08 },
    { lat: 50.085, lng: 5.2 },
  ],
  legs: [{ mode: "hike" }],
};

/** A leg drawn straight along the Lesse stretch, from one end to the other. */
const alongLesse: Trip = {
  name: "",
  points: [
    { lat: 50.01143, lng: 5.12889 },
    { lat: 50.07934, lng: 5.15489 },
  ],
  legs: [{ mode: "hike" }],
};

/** A leg north of the Anderlecht lock. */
const nearLock: Trip = {
  name: "",
  points: [
    { lat: 50.83, lng: 4.26 },
    { lat: 50.83, lng: 4.34 },
  ],
  legs: [{ mode: "hike" }],
};

const storedTrip = (page: Page): Promise<Trip> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null").trip, TRIP_KEY);

/** Opens the phone with `trip` stored, the map fitted to it and its leg drawn. */
async function openWith(page: Page, trip: Trip) {
  const network = await serveOffline(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(points(page)).toHaveCount(trip.points.length);
  // Routing fails offline: the leg is drawn straight, dashed.
  await expect(mapRegion(page).locator("path.leg").first()).toHaveClass(/leg-failed/);
  return network;
}

/** Waits until a path stops moving on screen (the map has settled after fitting the trip). */
async function settled(page: Page, path: ReturnType<typeof water>) {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await middleOf(path));
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [200] },
    )
    .toBe(true);
}

/** The middle of a drawn path (by length), in viewport pixels. */
const middleOf = (path: ReturnType<typeof water>): Promise<Pixel> =>
  path.evaluate((element) => {
    const svg = element as SVGPathElement;
    const half = svg.getPointAtLength(svg.getTotalLength() / 2);
    const { x, y } = new DOMPoint(half.x, half.y).matrixTransform(svg.getScreenCTM()!);
    return { x, y };
  });

test("the layers button under the position button switches the access layer on and off", async ({ page }) => {
  const network = await openWith(page, nearLesse);
  await expect(layersButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(waters(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);

  // It sits under the position button, top right.
  const position = (await page.getByRole("button", { name: phoneText.showPositionButton }).boundingBox())!;
  const layers = (await layersButton(page).boundingBox())!;
  expect(layers.y).toBeGreaterThan(position.y + position.height - 1);
  expect(Math.abs(layers.x + layers.width - (position.x + position.width))).toBeLessThan(2);

  await layersButton(page).click();
  await expect(layersButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(water(page, LESSE)).toBeVisible();
  await expect(chip(page)).toBeVisible();

  await layersButton(page).click();
  await expect(layersButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(waters(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  expect(network.blocked).toEqual([]);
});

test("the chip's dialog holds the date, legend, note and disclaimer; Today and Trip day colour the waters; Close goes back to the chip", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-07-15T10:00:00+02:00"));
  const network = await openWith(page, nearLesse);
  await layersButton(page).click();

  // Today (15 July) is outside the Lesse's season.
  await expect(chip(page)).toHaveAccessibleName(phoneText.accessChip(phoneText.accessChipToday));
  await expect(water(page, LESSE)).toHaveAttribute("stroke", ORANGE);

  await chip(page).click();
  await expect(accessDialog(page)).toBeVisible();
  const legend = accessDialog(page).getByRole("region", { name: strings.accessLegendLabel });
  for (const label of Object.values(strings.accessState)) await expect(legend.getByText(label, { exact: true })).toBeVisible();
  await expect(accessDialog(page)).toContainText(strings.accessLegendNote);
  await expect(accessDialog(page)).toContainText(strings.navigationRulesNotice);

  // The trip's first day (15 December) is in season.
  await accessDialog(page).getByLabel(strings.accessTripDayLabel).selectOption("2026-12-15");
  await expect(waterBehind(page, LESSE)).toHaveAttribute("stroke", GREEN);
  await expect(chipBehind(page)).toHaveAttribute("aria-label", phoneText.accessChip("2026-12-15"));

  await accessDialog(page).getByRole("button", { name: strings.accessTodayButton }).click();
  await expect(waterBehind(page, LESSE)).toHaveAttribute("stroke", ORANGE);
  await expect(chipBehind(page)).toHaveAttribute("aria-label", phoneText.accessChip(phoneText.accessChipToday));

  // A dialog like the others (#163): finger-sized date field, Close goes back to the chip.
  await expect(accessDialog(page).getByLabel(strings.accessDateLabel)).toHaveCSS("height", "44px");
  await accessDialog(page).getByRole("button", { name: phoneText.accessDialogClose }).click();
  await expect(accessDialog(page)).toHaveCount(0);
  await expect(chip(page)).toBeFocused();
  expect(network.blocked).toEqual([]);
});

test("with the layer on, a tap on water adds a route point", async ({ page }) => {
  await openWith(page, nearLesse);
  await layersButton(page).click();
  await settled(page, water(page, LESSE));
  const middle = await middleOf(water(page, LESSE));
  await page.touchscreen.tap(middle.x, middle.y);
  await expect(points(page)).toHaveCount(3);
  await expect(waterDetails(page)).toHaveCount(0);
  expect((await storedTrip(page)).points).toHaveLength(3);
});

test("holding a water off a leg opens its details in the sheet at half; Close goes back to the tab", async ({ page }) => {
  await openWith(page, nearLesse);
  await layersButton(page).click();
  await settled(page, water(page, LESSE));
  await expect(sheet(page)).toHaveAttribute("data-stop", "peek");
  await expect(tab(page, phoneText.tabs.legs)).toHaveAttribute("aria-selected", "true");

  await (await touch(page)).hold(await middleOf(water(page, LESSE)), 550);

  await expect(waterDetails(page)).toBeVisible();
  await expect(waterDetails(page)).toContainText(strings.accessCategory("1.C"));
  await expect(sheet(page)).toHaveAttribute("data-stop", "half");
  // Above the current tab, which stays selected.
  await expect(tab(page, phoneText.tabs.legs)).toHaveAttribute("aria-selected", "true");
  // Holding opened details; it added no point.
  await expect(points(page)).toHaveCount(2);

  await waterDetails(page).getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(waterDetails(page)).toHaveCount(0);
  await expect(sheet(page).getByRole("tabpanel")).toBeVisible();
  await expect(tab(page, phoneText.tabs.legs)).toHaveAttribute("aria-selected", "true");
});

test("a tap on a lock opens its details in the sheet", async ({ page }) => {
  await openWith(page, nearLock);
  await layersButton(page).click();
  await expect(lock(page, ANDERLECHT_LOCK)).toBeVisible();
  await settled(page, lock(page, ANDERLECHT_LOCK));
  const at = (await lock(page, ANDERLECHT_LOCK).boundingBox())!;
  await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);

  await expect(lockDetails(page)).toBeVisible();
  await expect(lockDetails(page)).toContainText(strings.lockPortageRequired);
  await expect(sheet(page)).toHaveAttribute("data-stop", "half");
  await expect(points(page)).toHaveCount(2);

  await lockDetails(page).getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(lockDetails(page)).toHaveCount(0);
});

// Spec story 81: details open at half even from 90%, not only from the peek.
test("a tap on a lock with the sheet at 90% opens its details with the sheet at half", async ({ page }) => {
  await openWith(page, nearLock);
  await layersButton(page).click();
  await expect(lock(page, ANDERLECHT_LOCK)).toBeVisible();
  await settled(page, lock(page, ANDERLECHT_LOCK));
  const fingers = await touch(page);
  // Pan the lock into the strip of map the sheet leaves at 90%, clear of the floating buttons.
  // The finger is held still before lifting, so the map doesn't glide on (no inertia).
  const box0 = (await lock(page, ANDERLECHT_LOCK).boundingBox())!;
  const start = { x: box0.x + box0.width / 2, y: box0.y + box0.height / 2 };
  const target = { x: 110, y: 72 };
  const finger = await fingers.press(start);
  for (let i = 1; i <= 10; i++)
    await finger.moveTo({ x: start.x + ((target.x - start.x) * i) / 10, y: start.y + ((target.y - start.y) * i) / 10 });
  await page.waitForTimeout(300); // holding still is a duration by definition
  await finger.release();
  await settled(page, lock(page, ANDERLECHT_LOCK));
  // Raise the sheet to 90% by its handle area.
  const box = (await sheet(page).boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + 8 };
  await fingers.drag(from, { x: from.x, y: 20 });
  await expect(sheet(page)).toHaveAttribute("data-stop", "full");
  // Wait until it has slid up, so the tap lands on the map, not on the moving sheet.
  const screen = page.viewportSize()!.height;
  await expect.poll(async () => screen - (await sheet(page).boundingBox())!.y).toBeGreaterThan(screen * 0.85);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

  const at = (await lock(page, ANDERLECHT_LOCK).boundingBox())!;
  await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
  await expect(lockDetails(page)).toBeVisible();
  await expect(sheet(page)).toHaveAttribute("data-stop", "half");
});

// #126: held sideways, the side panel hosts the details as the sheet does.
test("sideways, a tap on a lock opens the side panel with its details above the tab", async ({ page }) => {
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await openWith(page, nearLock);
  const panel = page.getByRole("complementary", { name: phoneText.sheetLabel });
  await expect(panel.getByRole("button", { name: phoneText.expandPanelButton })).toBeVisible();
  await layersButton(page).click();
  await expect(lock(page, ANDERLECHT_LOCK)).toBeVisible();
  await settled(page, lock(page, ANDERLECHT_LOCK));
  const at = (await lock(page, ANDERLECHT_LOCK).boundingBox())!;
  await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);

  const details = panel.getByRole("region", { name: strings.lockDetailLabel });
  await expect(details).toBeVisible();
  await expect(details).toContainText(strings.lockPortageRequired);
  await expect(panel.getByRole("button", { name: phoneText.collapsePanelButton })).toBeVisible();
  await expect(panel.getByRole("tabpanel")).toBeHidden();

  await details.getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(details).toHaveCount(0);
  await expect(panel.getByRole("tabpanel")).toBeVisible();
});

test("with the layer on, holding a leg on water still inserts a point, not details", async ({ page }) => {
  await openWith(page, alongLesse);
  await layersButton(page).click();
  const leg = mapRegion(page).locator(".leaflet-overlay-pane path.leg").first();
  await settled(page, leg);
  await (await touch(page)).hold(await middleOf(leg), 550);
  await expect(points(page)).toHaveCount(3);
  await expect(waterDetails(page)).toHaveCount(0);
});
