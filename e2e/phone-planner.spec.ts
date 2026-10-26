// The phone planner shell (#118, ADR 0026): a full-screen map with a bottom
// sheet, tap to add points, undo, show my position. Portrait only.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { touch } from "./support/touch";

// A phone (the browser itself can't be chosen per file).
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const routed = { brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }) };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: strings.phone.sheetLabel });
const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });
const showPosition = (page: Page) => page.getByRole("button", { name: strings.phone.showPositionButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const legRows = (page: Page) => sheet(page).getByRole("list", { name: strings.legsPanelLabel }).getByRole("listitem");
const positionMarker = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.my-position");

const AT_HOTTON = { latitude: 50.268, longitude: 5.446 };

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Taps the map at an offset from its centre, in screen pixels. */
async function tapMap(page: Page, dx: number, dy: number) {
  const box = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2 + dx, box.y + box.height / 3 + dy);
}

/** How much of the screen the sheet covers, in pixels. */
async function sheetHeight(page: Page) {
  const box = (await sheet(page).boundingBox())!;
  return page.viewportSize()!.height - box.y;
}

/** Drags the sheet by its handle area, with the mouse (Playwright's touchscreen can only tap). */
async function dragSheet(page: Page, dy: number) {
  const box = (await sheet(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy / 2, { steps: 5 });
  await page.mouse.move(x, y + dy, { steps: 5 });
  await page.mouse.up();
}

const dataFonts = (page: Page) => page.evaluate(() => document.fonts.ready.then(() => true));

test("tapping the map adds points, routes the legs, updates the totals; undo removes the last point", async ({
  page,
}) => {
  const network = await serveOffline(page, routed);
  await openPhone(page);

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("heading", { name: strings.tripNamePlaceholder })).toBeVisible();
  await expect(undoButton(page)).toBeDisabled();

  await tapMap(page, -100, 0);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);
  await tapMap(page, 100, 0);
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveClass(/leg-hike/);
  await expect.poll(() => network.brouter.length).toBe(1);

  // The totals are in the peek.
  await expect(sheet(page)).toContainText(strings.kilometreUnit);
  await expect(sheet(page).locator(".phone-totals")).not.toContainText(/^\s*0\.0 km/);
  const before = await sheet(page).locator(".phone-totals").textContent();

  await tapMap(page, 100, 120);
  await expect(legLines(page)).toHaveCount(2);
  await expect.poll(() => sheet(page).locator(".phone-totals").textContent()).not.toBe(before);

  // The legs tab lists compact rows: mode, distance, time.
  await tab(page, strings.phone.tabs.legs).click();
  await expect(legRows(page)).toHaveCount(2);
  await expect(legRows(page).first()).toContainText(strings.legModeHike);
  await expect(legRows(page).first()).toContainText(strings.kilometreUnit);

  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();
  await expect(legLines(page)).toHaveCount(1);
  await expect(legRows(page)).toHaveCount(1);
  await undoButton(page).click();
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);
  await undoButton(page).click();
  await expect(mapRegion(page).locator("path.point")).toHaveCount(0);
  await expect(undoButton(page)).toBeDisabled();
  expect(network.blocked).toEqual([]);
});

test("the peek shows the trip name, the totals and the five tabs; a tab press at peek raises the sheet to half", async ({
  page,
}) => {
  await serveOffline(page);
  await openPhone(page);
  await dataFonts(page);

  const names = Object.values(strings.phone.tabs);
  for (const name of names) await expect(tab(page, name)).toBeVisible();
  await expect(sheet(page).locator(".phone-totals")).toBeVisible();

  // The sheet slides in when the planner opens.
  await expect.poll(() => sheetHeight(page)).toBeLessThan(200);
  await tab(page, strings.phone.tabs.days).click();
  await expect(tab(page, strings.phone.tabs.days)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(page.viewportSize()!.height * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(page.viewportSize()!.height * 0.55);
});

test("on a narrow phone the tab row scrolls sideways and every tab keeps its full name", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await serveOffline(page);
  await openPhone(page);
  await dataFonts(page);

  const list = sheet(page).getByRole("tablist", { name: strings.phone.tabsLabel });
  const { scrollWidth, clientWidth } = await list.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  // Each tab is as wide as its text: nothing is squeezed or wrapped.
  for (const name of Object.values(strings.phone.tabs)) {
    const fits = await tab(page, name).evaluate((el) => el.scrollWidth <= el.clientWidth && el.clientHeight < 60);
    expect(fits).toBe(true);
  }
  await tab(page, strings.phone.tabs.settings).scrollIntoViewIfNeeded();
  await expect(tab(page, strings.phone.tabs.settings)).toBeInViewport();
});

test("the sheet settles at peek, half or 90% by drag distance, never closes, and the map stays usable", async ({
  page,
}) => {
  await serveOffline(page, routed);
  await openPhone(page);
  const screen = page.viewportSize()!.height;

  const peek = 128; // 8rem, once the sheet has slid in
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - peek)).toBeLessThan(4);
  await dragSheet(page, -(screen * 0.3));
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(screen * 0.55);

  // The map is usable while the sheet is raised (non-modal).
  await tapMap(page, -60, 0);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);

  await dragSheet(page, -(screen * 0.5));
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.85);

  // Dragging it all the way down settles at the peek; it never closes.
  await dragSheet(page, screen);
  await expect.poll(() => sheetHeight(page)).toBeLessThan(peek + 4);
  await expect(sheet(page)).toBeVisible();
  await expect(tab(page, strings.phone.tabs.legs)).toBeVisible();
  // And it stays there: the drawer doesn't bounce back to 90% once its animations end (#126).
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(300);
  expect(await sheetHeight(page)).toBeLessThan(peek + 4);
});

// #120 (from #118): the same stops with a finger, through the touch helper.
test("a finger drag on the sheet settles at peek, half or 90% and never closes it", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  const screen = page.viewportSize()!.height;
  const fingers = await touch(page);
  /** Drags the sheet by its handle area with one finger. */
  const fingerDrag = async (dy: number) => {
    const box = (await sheet(page).boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + 8 };
    await fingers.drag(from, { x: from.x, y: from.y + dy });
  };

  const peek = 128; // 8rem, once the sheet has slid in
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - peek)).toBeLessThan(4);
  await fingerDrag(-(screen * 0.3));
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(screen * 0.55);

  await fingerDrag(-(screen * 0.5));
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.85);

  await fingerDrag(screen);
  await expect.poll(() => sheetHeight(page)).toBeLessThan(peek + 4);
  await expect(sheet(page)).toBeVisible();
  await expect(tab(page, strings.phone.tabs.legs)).toBeVisible();
});

test("a double tap neither zooms nor adds two points", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  const zoom = () => mapRegion(page).locator(".leaflet-tile-container").first().getAttribute("style");
  const before = await zoom();

  const box = (await mapRegion(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x + 2, y + 2);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);
  await page.waitForTimeout(600); // let a zoom animation start if there were one
  expect(await zoom()).toBe(before);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);
});

test("a pinch zooms the map and adds no point", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  const map = mapRegion(page);
  const box = (await map.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 3;
  const tilePixels = async () => (await map.locator("img.leaflet-tile-loaded").first().boundingBox())!.width;
  const before = await tilePixels();

  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd",points: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(({ x, y }, id) => ({ x, y, id })) });
  await touch("touchStart", [
    { x: cx - 20, y: cy },
    { x: cx + 20, y: cy },
  ]);
  for (let step = 1; step <= 8; step++) {
    await touch("touchMove", [
      { x: cx - 20 - step * 12, y: cy },
      { x: cx + 20 + step * 12, y: cy },
    ]);
  }
  await touch("touchEnd", []);

  await expect.poll(tilePixels).toBeGreaterThan(before);
  await expect(map.locator("path.point")).toHaveCount(0);
});

test("◎ shows the position dot, also with the network blocked", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 12 });
  await serveOffline(page);
  await openPhone(page);
  await expect(positionMarker(page)).toHaveCount(0);

  await context.setOffline(true);
  await showPosition(page).click();

  await expect(positionMarker(page)).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: strings.phone.positionAccuracy("12 m") })).toBeVisible();
});

test("a denied location permission says so", async ({ page, context }) => {
  await context.clearPermissions();
  await serveOffline(page);
  await openPhone(page);
  await page.evaluate(() => {
    const denied = { code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    navigator.geolocation.watchPosition = (_success, failure) => {
      failure?.(denied as GeolocationPositionError);
      return 0;
    };
  });
  await showPosition(page).click();
  await expect(page.getByRole("alert").filter({ hasText: strings.phone.positionDenied })).toBeVisible();
  await expect(positionMarker(page)).toHaveCount(0);
});

const STORED: Trip = {
  name: "Ourthe weekend",
  points: [
    { lat: 50.26, lng: 5.44 },
    { lat: 50.27, lng: 5.45 },
  ],
  legs: [{ mode: "hike" }],
  camps: [],
};

test("offline, the planner opens from the app cache with the stored trip; an unroutable leg is dashed with Retry", async ({
  page,
  context,
}) => {
  await serveOffline(page);
  await page.addInitScript(
    ([key, saved]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, saved);
        sessionStorage.setItem("seeded", "yes");
      }
    },
    [TRIP_KEY, serialiseTrip(STORED)] as const,
  );
  await openPhone(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve));
  });

  await context.setOffline(true);
  await page.reload();

  await expect(sheet(page).getByRole("heading", { name: "Ourthe weekend" })).toBeVisible();
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveAttribute("stroke-dasharray", "8 8");
  await tab(page, strings.phone.tabs.legs).click();
  await expect(legRows(page).first().getByRole("button", { name: strings.retryRouting })).toBeVisible();
  // No offline banner.
  await expect(page.getByText(/offline/i)).toHaveCount(0);
});

test("every control has an accessible name", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, [role=tab]")]
      .filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim()))
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});

test.describe("which screens get the phone planner", () => {
  const isPhonePlanner = async (page: Page) => {
    await openPhone(page);
    return sheet(page).isVisible();
  };
  const isDesktop = (page: Page) => page.getByRole("button", { name: strings.newTripButton }).isVisible();

  test("640 px wide gets the phone planner, 641 px the desktop planner", async ({ page }) => {
    await serveOffline(page);
    await page.setViewportSize({ width: 640, height: 900 });
    expect(await isPhonePlanner(page)).toBe(true);
    await page.setViewportSize({ width: 641, height: 900 });
    await expect(page.getByRole("button", { name: strings.newTripButton })).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
  });

  test("a sideways phone (touch, 640 px tall or less) keeps the phone layout", async ({ page }) => {
    await serveOffline(page);
    await page.setViewportSize({ width: 863, height: 360 });
    await openPhone(page);
    // Sideways the side panel stands in for the sheet (#126).
    await expect(page.getByRole("complementary", { name: strings.phone.sheetLabel })).toBeVisible();
    expect(await isDesktop(page)).toBe(false);
  });

  test("an iPad-sized touch screen gets the desktop layout", async ({ page }) => {
    await serveOffline(page);
    await page.setViewportSize({ width: 810, height: 1080 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: strings.newTripButton })).toBeVisible();
    expect(await isDesktop(page)).toBe(true);
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe("a narrowed desktop window with a mouse", () => {
  test.use({ viewport: { width: 500, height: 800 }, isMobile: false, hasTouch: false });

  test("works: a click adds a point and the sheet is usable", async ({ page }) => {
    await serveOffline(page, routed);
    await openPhone(page);
    const box = (await mapRegion(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 - 60, box.y + 150);
    await page.mouse.click(box.x + box.width / 2 + 60, box.y + 150);
    await expect(legLines(page)).toHaveCount(1);
    await tab(page, strings.phone.tabs.legs).click();
    await expect(legRows(page)).toHaveCount(1);
    await undoButton(page).click();
    await expect(legLines(page)).toHaveCount(0);
  });
});
