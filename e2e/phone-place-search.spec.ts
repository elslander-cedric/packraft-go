// Place search on the phone (#174, ADR 0030): a pill on the top row widens into a field
// with its results under it, above the on-screen keyboard; picking one narrows it back and
// pins the result. Every external request goes through serveOffline, and anything else is
// blocked and checked.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { mapMenuButton, toggleAccessLayer } from "./support/mapMenu";
import { nominatimFixture, serveOffline } from "./support/offline";

// The mobile preset: 375 × 812, a touch phone.
const { userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport: { width: 375, height: 812 }, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.placeSearch;

/** The recorded answer for each search text; any other text is a 503. */
const SEARCHES: Record<string, string> = {
  hotton: "search-hotton.json",
  luik: "search-luik.json",
  qxzvbwplm: "search-nothing-found.json",
};
const bySearchText = (url: URL) => {
  const file = SEARCHES[url.searchParams.get("q")?.toLowerCase() ?? ""];
  return file ? nominatimFixture(file)() : { status: 503, body: "" };
};

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const pill = (page: Page) => page.getByRole("button", { name: text.label });
const field = (page: Page) => page.getByRole("combobox", { name: text.label });
const back = (page: Page) => page.getByRole("button", { name: text.back });
const results = (page: Page) => page.getByRole("listbox", { name: text.resultsLabel }).getByRole("option");
const clear = (page: Page) => page.getByRole("button", { name: text.clear });
const pin = (page: Page) => mapRegion(page).locator(".search-result-marker");
const pinLabel = (page: Page) => mapRegion(page).locator(".search-result-label");
const menuButton = (page: Page) => page.getByRole("button", { name: strings.planner.menu.button });
const positionButton = (page: Page) => page.getByRole("button", { name: strings.planner.showPositionButton });
const chip = (page: Page) => page.getByRole("button", { name: /^Access · / });
const accessDialog = (page: Page) => page.getByRole("dialog", { name: strings.planner.accessDialogTitle });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.planner.sheetLabel });

/** The requests serveOffline blocked in the running test: there must be none (no live call, ADR 0019). */
let blocked: string[] = [];
async function offline(page: Page, options: Parameters<typeof serveOffline>[1] = {}) {
  const network = await serveOffline(page, options);
  blocked = network.blocked;
  return network;
}
test.afterEach(() => expect(blocked).toEqual([]));

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Opens the field from the pill and searches `what`. */
async function search(page: Page, what: string) {
  await pill(page).click();
  await field(page).fill(what);
  await field(page).press("Enter");
}

/** The zoom of the tiles asked for last. */
const lastZoom = (tiles: { z: number }[]) => tiles.at(-1)?.z;

type Box = { x: number; y: number; width: number; height: number };
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
const box = async (locator: Locator) => (await locator.boundingBox())!;

/** Waits for the fonts and for the sheet's, the panel's and the floating controls' animations to end. */
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
}

test("search, pick: the field narrows back, the map moves and pins the result, × clears it", async ({ page }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openPhone(page);

  // The pill opens a focused field with Back; the pill itself gives way to it.
  await pill(page).click();
  await expect(field(page)).toBeFocused();
  await expect(back(page)).toBeVisible();

  await field(page).fill("hotton");
  await page.getByRole("button", { name: text.search, exact: true }).click();
  await expect(results(page)).toHaveCount(2);
  await expect(results(page).first()).toContainText("Hotton");
  expect(network.nominatim).toHaveLength(1);

  await results(page).nth(1).click();
  // Narrowed back to the pill, which holds the result's name.
  await expect(field(page)).toHaveCount(0);
  await expect(pill(page)).toContainText("Hotton");
  await expect(pin(page)).toBeVisible();
  await expect(pinLabel(page)).toHaveText("Hotton");
  await expect.poll(() => lastZoom(network.tiles)).toBeGreaterThanOrEqual(10);

  await clear(page).click();
  await expect(pin(page)).toHaveCount(0);
  await expect(pill(page)).not.toContainText("Hotton");
  await expect(pill(page)).toContainText(text.placeholder);
});

test("nothing found says so under the field and keeps the map where it is", async ({ page }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openPhone(page);
  const zoom = lastZoom(network.tiles);
  await search(page, "qxzvbwplm");
  await expect(page.getByRole("status").filter({ hasText: text.nothingFound("qxzvbwplm") })).toBeVisible();
  await expect(field(page)).toBeVisible();
  await expect(pin(page)).toHaveCount(0);
  expect(lastZoom(network.tiles)).toBe(zoom);
});

test("with the sheet raised, the results show over it and can be picked", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openPhone(page);
  await page.getByRole("dialog", { name: strings.planner.sheetLabel }).getByRole("tab", { name: strings.planner.tabs.days }).click();
  await settled(page);
  await search(page, "hotton");
  await expect(results(page)).toHaveCount(2);
  // The last result is on top where it is drawn, not under the sheet.
  const last = await box(results(page).last());
  const onTop = await results(page)
    .last()
    .evaluate((el, at) => el.contains(document.elementFromPoint(at.x, at.y)), {
      x: last.x + last.width / 2,
      y: last.y + last.height / 2,
    });
  expect(onTop).toBe(true);
  await results(page).last().click();
  await expect(pinLabel(page)).toHaveText("Hotton");
});

test("a failed search offers Retry, which asks the same text again", async ({ page }) => {
  let fail = true;
  const network = await offline(page, {
    nominatim: (url) => (fail ? { status: 503, body: "" } : bySearchText(url)),
  });
  await openPhone(page);
  await search(page, "hotton");
  const alert = page.getByRole("alert").filter({ hasText: text.failed });
  await expect(alert).toBeVisible();

  fail = false;
  await alert.getByRole("button", { name: text.retry }).click();
  await expect(results(page)).toHaveCount(2);
  expect(network.nominatim).toHaveLength(2);
  expect(network.nominatim[1].searchParams.get("q")).toBe("hotton");
  expect(network.nominatim[1].searchParams.get("viewbox")).toBe(network.nominatim[0].searchParams.get("viewbox"));
});

test("offline: no request, Retry once back online", async ({ page, context }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openPhone(page);
  await context.setOffline(true);
  await search(page, "hotton");
  const alert = page.getByRole("alert").filter({ hasText: text.offline });
  await expect(alert).toBeVisible();
  expect(network.nominatim).toHaveLength(0);

  await context.setOffline(false);
  await alert.getByRole("button", { name: text.retry }).click();
  await expect(results(page)).toHaveCount(2);
  expect(network.nominatim).toHaveLength(1);
});

test("coordinates jump there with no request, in the middle of the map the sheet leaves free", async ({
  page,
  context,
}) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openPhone(page);
  await context.setOffline(true);
  await search(page, "50.27N 5.44E");
  await expect(field(page)).toHaveCount(0);
  await expect(pill(page)).toContainText("50.27N 5.44E");
  await expect(pinLabel(page)).toHaveText("50.27N 5.44E");
  await expect.poll(() => lastZoom(network.tiles)).toBe(15);
  expect(network.nominatim).toHaveLength(0);

  // Once the map has zoomed, the pin's point is centred across it, and between the pill's row and the sheet.
  await settled(page);
  const map = await box(mapRegion(page));
  const sheetTop = (await box(page.getByRole("dialog", { name: strings.planner.sheetLabel }))).y;
  const pillBox = await box(pill(page));
  const marker = await box(pin(page));
  const tip = { x: marker.x + 14, y: marker.y + 34 };
  expect(Math.abs(tip.x - (map.x + map.width / 2))).toBeLessThan(2);
  expect(Math.abs(tip.y - (pillBox.y + pillBox.height + sheetTop) / 2)).toBeLessThan(2);
});

test("bad coordinates say so and send nothing", async ({ page }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openPhone(page);
  await search(page, "95, 5");
  await expect(page.getByRole("alert").filter({ hasText: text.badCoordinates })).toBeVisible();
  expect(network.nominatim).toHaveLength(0);
});

test("Back closes the field and leaves the shown result", async ({ page }) => {
  await offline(page);
  await openPhone(page);
  await search(page, "50.27, 5.44");
  await expect(pin(page)).toBeVisible();

  await pill(page).click();
  await expect(field(page)).toHaveValue("50.27, 5.44");
  await field(page).fill("somewhere else");
  await back(page).click();
  await expect(field(page)).toHaveCount(0);
  await expect(pin(page)).toBeVisible();
  await expect(pill(page)).toContainText("50.27, 5.44");
});

test("a tap on the pin reaches the map and adds a point", async ({ page }) => {
  await offline(page);
  await openPhone(page);
  await search(page, "50.27, 5.44");
  await expect(pin(page)).toBeVisible();

  const marker = (await pin(page).boundingBox())!;
  await page.touchscreen.tap(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);
  await expect(pin(page)).toBeVisible();
});

// ---- Layout (#70: font-independent; each check waits for the fonts and asserts the real rule). ----

/** Fails unless `element` lies fully inside the viewport. */
async function expectOnScreen(page: Page, element: Locator) {
  const { width, height } = page.viewportSize()!;
  const b = await box(element);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(width);
  expect(b.y + b.height).toBeLessThanOrEqual(height);
}

/** A trip with a start date, so the access chip can show a trip day: its longest text. */
const dated: Trip = {
  name: "",
  startDate: "2026-12-15",
  points: [
    { lat: 50.085, lng: 5.08 },
    { lat: 50.085, lng: 5.2 },
  ],
  legs: [{ mode: "hike" }],
};

/** Opens the phone on `dated` with the access layer on and the chip on the trip's first day. */
async function withTripDayChip(page: Page) {
  await offline(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(dated)]);
  await openPhone(page);
  await toggleAccessLayer(page);
  await chip(page).click();
  await accessDialog(page).getByLabel(strings.accessTripDayLabel).selectOption("2026-12-15");
  await accessDialog(page).getByRole("button", { name: strings.planner.accessDialogClose }).click();
  await expect(chip(page)).toHaveAccessibleName(strings.planner.accessChip("2026-12-15"));
  await settled(page);
}

/** The pill sits on the top row between the menu and the right-hand buttons, touching neither. */
async function expectPillBetweenButtons(page: Page) {
  const pillBox = await box(page.locator(".planner-place-search"));
  expect(apart(pillBox, await box(menuButton(page)))).toBe(true);
  expect(apart(pillBox, await box(positionButton(page)))).toBe(true);
  expect(apart(pillBox, await box(mapMenuButton(page)))).toBe(true);
  // Still a 44 px touch target, as every phone control.
  expect(pillBox.width).toBeGreaterThanOrEqual(44);
}

/** The chip is on its own row under the pill, fully visible, its whole text shown. */
async function expectChipUnderPill(page: Page) {
  const pillBox = await box(page.locator(".planner-place-search"));
  const chipBox = await box(chip(page));
  expect(chipBox.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height);
  expect(apart(chipBox, await box(mapMenuButton(page)))).toBe(true);
  await expectOnScreen(page, chip(page));
  expect(await chip(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

for (const size of [
  { width: 375, height: 812 },
  { width: 320, height: 640 },
]) {
  test(`at ${size.width} px the pill sits between the buttons and the access chip, on its own row under it, is fully visible`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await withTripDayChip(page);
    await expectPillBetweenButtons(page);
    await expectChipUnderPill(page);

    // Open, the field widens over the buttons beside it and stays on screen.
    await pill(page).click();
    await expectOnScreen(page, page.locator(".planner-place-search-open"));
  });
}

test("sideways, the pill and the open field stop short of the side panel, collapsed or open", async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await withTripDayChip(page);
  // The panel opens on first load (ADR 0034); start from the strip.
  await panel(page).getByRole("button", { name: strings.planner.collapsePanelButton }).click();
  await settled(page);

  for (const state of ["collapsed", "open"]) {
    if (state === "open") {
      await panel(page).getByRole("button", { name: strings.planner.expandPanelButton }).click();
      await settled(page);
    }
    const panelLeft = (await box(panel(page))).x;
    const pillBox = await box(page.locator(".planner-place-search"));
    expect(pillBox.x + pillBox.width, `pill, panel ${state}`).toBeLessThanOrEqual(panelLeft);
    await expectPillBetweenButtons(page);
    await expectChipUnderPill(page);
    const chipBox = await box(chip(page));
    expect(chipBox.x + chipBox.width, `chip, panel ${state}`).toBeLessThanOrEqual(panelLeft);

    await pill(page).click();
    await settled(page);
    const open = await box(page.locator(".planner-place-search-open"));
    expect(open.x + open.width, `open field, panel ${state}`).toBeLessThanOrEqual(panelLeft);
    await back(page).click();
  }
});

test.describe("the on-screen keyboard", () => {
  test.beforeEach(async ({ page }) => {
    // A visualViewport the test can shrink: `__keyboard(px)` opens a keyboard that tall, as on a phone (#163).
    await page.addInitScript(() => {
      const fake = new EventTarget();
      let keyboard = 0;
      Object.defineProperties(fake, {
        width: { get: () => window.innerWidth },
        height: { get: () => window.innerHeight - keyboard },
        offsetLeft: { value: 0 },
        offsetTop: { value: 0 },
        pageLeft: { get: () => window.scrollX },
        pageTop: { get: () => window.scrollY },
        scale: { value: 1 },
      });
      Object.defineProperty(window, "visualViewport", { value: fake, configurable: true });
      (window as unknown as { __keyboard: (px: number) => void }).__keyboard = (px) => {
        keyboard = px;
        fake.dispatchEvent(new Event("resize"));
      };
    });
  });

  const openKeyboard = (page: Page, px: number) =>
    page.evaluate((height) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(height), px);

  /** Fails unless `element` lies fully inside the area above the keyboard. */
  async function expectAboveKeyboard(page: Page, element: Locator) {
    const height = await page.evaluate(() => window.visualViewport!.height);
    await expect
      .poll(async () => {
        const b = await box(element);
        return b.y >= 0 && b.y + b.height <= height;
      })
      .toBe(true);
  }

  test("the field and its results stay above the keyboard; only the results scroll", async ({ page }) => {
    await offline(page, { nominatim: bySearchText });
    await openPhone(page);
    await search(page, "luik");
    await expect(results(page)).toHaveCount(3);

    // A tall keyboard leaves less room than the results need.
    await openKeyboard(page, 620);
    const open = page.locator(".planner-place-search-open");
    await expectAboveKeyboard(page, open);
    await expectAboveKeyboard(page, field(page));
    const answer = open.locator(".search-box-answer");
    expect(await answer.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const last = results(page).last();
    await last.scrollIntoViewIfNeeded();
    await expectAboveKeyboard(page, last);
    await expectAboveKeyboard(page, field(page));

    // The keyboard closes: the results show in full again.
    await openKeyboard(page, 0);
    await expect.poll(() => answer.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);
  });
});
