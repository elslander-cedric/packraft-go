// The phone planner on a wide screen with a mouse and a keyboard (#189, stage 2 of ADR 0034):
// the unknown-version autosave warning, the mouse gestures (a 0.4 s hold on a leg inserts a
// point, the wheel zooms, a double-click doesn't) and keyboard-only use, also of the portrait
// sheet. Until the screen rule switches (stage 3), `?planner=phone` gives this desktop-sized
// window the phone planner.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { SAVE_FORMAT, serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { confirmDialog, expectInitialFocus } from "./support/confirmDialog";
import { brouterFixture, serveOffline } from "./support/offline";

test.use({ viewport: { width: 1280, height: 800 } });

const routed = { brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }) };

// The two ends of the recorded hiking route, so the routed leg is drawn from point to point.
const trip: Trip = {
  name: "",
  points: [
    { lat: 50.352699, lng: 5.456097 },
    { lat: 50.343913, lng: 5.470053 },
  ],
  legs: [{ mode: "hike" }],
};

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.phone.sheetLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const storedTrip = (page: Page) => page.evaluate((key) => localStorage.getItem(key), TRIP_KEY);
const tileZoom = (page: Page) =>
  mapRegion(page).evaluate((element) =>
    Number(element.querySelector<HTMLImageElement>("img.leaflet-tile-loaded")?.src.match(/\/(\d+)\/\d+\/\d+/)?.[1]),
  );

/** Opens the phone planner with `stored` as the autosave, if given. */
async function openPlanner(page: Page, stored?: string) {
  if (stored !== undefined) await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, stored]);
  await page.goto("/?planner=phone");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(panel(page)).toBeVisible();
}

/** Waits until the map stops moving, so pixel positions hold. */
async function mapSettled(page: Page) {
  await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  let last = "";
  await expect
    .poll(
      async () => {
        const now = await mapRegion(page)
          .locator(".leaflet-map-pane")
          .evaluate((element) => getComputedStyle(element).transform);
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [200] },
    )
    .toBe(true);
}

/**
 * A spot on the first drawn leg, in viewport pixels, clear of the floating buttons and left of
 * the side panel (the recorded route bends under it).
 */
async function onLeg(page: Page) {
  const panelLeft = (await panel(page).boundingBox())!.x;
  const map = (await mapRegion(page).boundingBox())!;
  const free = { maxX: panelLeft - 40, minY: map.y + 140, maxY: map.y + map.height - 140 };
  return legLines(page)
    .first()
    .evaluate((element, { maxX, minY, maxY }) => {
      const path = element as SVGPathElement;
      const length = path.getTotalLength();
      for (let share = 0.2; share <= 0.8; share += 0.05) {
        const along = path.getPointAtLength(length * share);
        const { x, y } = new DOMPoint(along.x, along.y).matrixTransform(path.getScreenCTM()!);
        if (x < maxX && y > minY && y < maxY) return { x, y };
      }
      throw new Error("no part of the leg is clear of the buttons and the panel");
    }, free);
}

/** Presses the left mouse button at `at`, holds it still for `ms`, and lets go. */
async function mouseHold(page: Page, at: { x: number; y: number }, ms: number) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test("an unknown-version autosave shows the warning, and edits don't overwrite the kept save", async ({ page }) => {
  await serveOffline(page);
  const newer = JSON.stringify({ format: SAVE_FORMAT, version: 3, trip: { name: "From the future" } });
  await openPlanner(page, newer);

  await expect(page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion })).toBeVisible();
  const map = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(map.x + 300, map.y + 400);
  await expect(points(page)).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(await storedTrip(page)).toBe(newer);
});

test("a supported autosave shows no warning", async ({ page }) => {
  await serveOffline(page, routed);
  await openPlanner(page, serialiseTrip(trip));
  await expect(points(page)).toHaveCount(2);
  await expect(page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion })).toHaveCount(0);
});

test.describe("mouse gestures", () => {
  test("a 0.4 s mouse hold on a leg inserts a point and routes both halves; a click there adds one at the end", async ({
    page,
  }) => {
    const network = await serveOffline(page, routed);
    await openPlanner(page, serialiseTrip(trip));
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);
    await mapSettled(page);
    const middle = await onLeg(page);

    await mouseHold(page, { x: middle.x, y: middle.y + 6 }, 550);
    await expect(points(page)).toHaveCount(3);
    await expect.poll(() => network.brouter.length).toBe(3);
    const inserted = JSON.parse((await storedTrip(page))!).trip as Trip;
    expect(inserted.points[0]).toEqual(trip.points[0]);
    expect(inserted.points[2]).toEqual(trip.points[1]);
    expect(inserted.points[1].lat).toBeLessThan(trip.points[0].lat);
    expect(inserted.points[1].lat).toBeGreaterThan(trip.points[1].lat);

    // A plain click on a leg is a click on the map: it adds a point at the trip's end.
    await page.getByRole("button", { name: strings.undoButton }).click();
    await expect(points(page)).toHaveCount(2);
    await page.mouse.click(middle.x, middle.y + 6);
    await expect(points(page)).toHaveCount(3);
    const added = JSON.parse((await storedTrip(page))!).trip as Trip;
    expect(added.points.slice(0, 2)).toEqual(trip.points);
    expect(network.blocked).toEqual([]);
  });

  test("a mouse hold on empty map adds nothing, and a drag pans without adding", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    const map = (await mapRegion(page).boundingBox())!;
    const at = { x: map.x + 300, y: map.y + 400 };

    await mouseHold(page, at, 550);
    await page.waitForTimeout(300);
    await expect(points(page)).toHaveCount(0);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 120, at.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(points(page)).toHaveCount(0);

    // A plain click still adds a point.
    await page.mouse.click(at.x, at.y);
    await expect(points(page)).toHaveCount(1);
  });

  test("the wheel zooms; a double-click doesn't", async ({ page }) => {
    // A stored trip, so the map has already fitted it (once) and a click doesn't move it.
    await serveOffline(page, routed);
    await openPlanner(page, serialiseTrip(trip));
    await mapSettled(page);
    const map = (await mapRegion(page).boundingBox())!;
    const at = { x: map.x + 300, y: map.y + 400 };
    const before = await tileZoom(page);

    await page.mouse.dblclick(at.x, at.y);
    await page.waitForTimeout(500);
    expect(await tileZoom(page)).toBe(before);

    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -600);
    await expect.poll(() => tileZoom(page)).toBeGreaterThan(before);
  });
});

test.describe("keyboard alone", () => {
  const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
  const menuItem = (page: Page, name: string) => page.getByRole("menuitem", { name });
  const storedSettings = (page: Page) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), SETTINGS_KEY);
  const tripName = async (page: Page) => (JSON.parse((await storedTrip(page))!).trip as Trip).name;

  /** Presses Tab until `target` has focus; fails if it isn't reached within `limit` presses. */
  async function tabTo(page: Page, target: Locator, limit = 40) {
    await expect(target).toBeVisible();
    for (let i = 0; i < limit; i++) {
      if (await target.evaluate((element) => element === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
  }

  /** Opens the menu from its button and picks `item` with the arrow keys and Enter. */
  async function pickFromMenu(page: Page, item: string) {
    await tabTo(page, button(page, strings.phone.menu.button));
    await page.keyboard.press("Enter");
    await expect(menuItem(page, strings.phone.menu.newTrip)).toBeFocused();
    for (let i = 0; i < 8 && !(await menuItem(page, item).evaluate((e) => e === document.activeElement)); i++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(menuItem(page, item)).toBeFocused();
    await page.keyboard.press("Enter");
  }

  test("Tab reaches the map, every floating button, the panel's controls and the leg rows, each on screen", async ({
    page,
  }) => {
    await serveOffline(page, routed);
    await openPlanner(page, serialiseTrip(trip));
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);

    // Once round the page: from the first stop back to the page itself.
    const reached: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "", x, y, width, height };
      });
      if (stop === null) break;
      reached.push(stop.name);
      // Each stop is on screen, not off the page.
      expect(stop.width * stop.height, stop.name).toBeGreaterThan(0);
      expect(stop.x + stop.width, stop.name).toBeLessThanOrEqual(1280);
      expect(stop.y + stop.height, stop.name).toBeLessThanOrEqual(800);
    }
    for (const name of [
      strings.phone.menu.button,
      strings.placeSearch.pill(undefined),
      strings.phone.showPositionButton,
      strings.mapMenuButton,
      strings.phone.backToStartButton,
      strings.phone.markAccessPointButton,
      strings.legModeHike,
      strings.phone.resizePanelHandle,
      strings.phone.collapsePanelButton,
      strings.phone.tabs.legs,
    ]) {
      expect(reached, name).toContain(name);
    }
    expect(reached.some((name) => name.startsWith(strings.legLabel(1)))).toBe(true);
  });

  test("route, trip, settings, map, panel and search work with the keys alone; the shortcuts still work", async ({
    page,
  }) => {
    const network = await serveOffline(page, routed);
    await openPlanner(page, serialiseTrip(trip));
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);

    // Route back to the start, then undo it with the Undo button and again with Ctrl+Z.
    await tabTo(page, button(page, strings.phone.backToStartButton));
    await page.keyboard.press("Enter");
    await expect(legLines(page)).toHaveCount(2);
    await tabTo(page, button(page, strings.undoButton));
    await page.keyboard.press("Enter");
    await expect(legLines(page)).toHaveCount(1);
    await tabTo(page, button(page, strings.phone.backToStartButton));
    await page.keyboard.press("Enter");
    await expect(legLines(page)).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(legLines(page)).toHaveCount(1);

    // The next leg's mode: arrows move between Hike and Paddle, Space picks.
    const modes = page.getByRole("group", { name: strings.phone.nextLegModeLabel });
    await tabTo(page, modes.getByRole("button", { name: strings.legModeHike }));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(modes.getByRole("button", { name: strings.legModePaddle })).toHaveAttribute("aria-pressed", "true");

    // A leg row: Enter marks it and shows its leg.
    const row = panel(page).getByRole("button", { name: new RegExp(`^${strings.legLabel(1)} `) });
    await tabTo(page, row);
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-current", "true");

    // Edit trip: the name field has focus, Tab stays in the dialog; Enter saves; focus returns to
    // the menu button.
    await pickFromMenu(page, strings.phone.menu.tripDetails);
    const dialog = page.getByRole("dialog");
    const nameField = dialog.getByRole("textbox", { name: strings.tripNameLabel });
    await expect(nameField).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await nameField.focus();
    await page.keyboard.type("Ourthe");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => tripName(page)).toBe("Ourthe");
    await expect(button(page, strings.phone.menu.button)).toBeFocused();

    // Settings: the arrow keys step the pace factor; Enter saves.
    await pickFromMenu(page, strings.phone.menu.settings);
    const pace = page.getByRole("dialog").getByRole("textbox", { name: strings.paceFactorLabel });
    await expect(pace).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await storedSettings(page))?.paceFactor).toBeGreaterThan(1);
    await expect(button(page, strings.phone.menu.button)).toBeFocused();

    // The Map menu: a base map picked with the arrows and Enter.
    await tabTo(page, button(page, strings.mapMenuButton));
    await page.keyboard.press("Enter");
    // Keys go to the menu once it has focused its first item.
    await expect(page.getByRole("menuitemradio", { name: strings.baseMaps.opentopomap })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitemradio", { name: strings.baseMaps["aerial-be"] })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await storedSettings(page))?.baseMap).toBe("aerial-be");
    await page.keyboard.press("Escape");
    await expect(button(page, strings.mapMenuButton)).toBeFocused();

    // The panel's tabs: arrows move, Enter shows the tab.
    const tabs = panel(page).getByRole("tablist");
    await tabTo(page, tabs.getByRole("tab", { name: strings.phone.tabs.legs }));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(tabs.getByRole("tab", { name: strings.phone.tabs.days })).toHaveAttribute("aria-selected", "true");

    // The panel collapses and opens again.
    await tabTo(page, button(page, strings.phone.collapsePanelButton));
    await page.keyboard.press("Enter");
    await tabTo(page, button(page, strings.phone.expandPanelButton));
    await page.keyboard.press("Enter");
    await expect(button(page, strings.phone.collapsePanelButton)).toBeVisible();

    // Search opens into its field; Escape closes it and gives the focus back to the pill.
    const pill = button(page, strings.placeSearch.pill(undefined));
    await tabTo(page, pill);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: strings.placeSearch.label })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pill).toBeFocused();

    // New trip asks; Escape keeps the trip, and Tab + Enter on the confirm button clears it.
    await pickFromMenu(page, strings.phone.menu.newTrip);
    await expectInitialFocus(page);
    await page.keyboard.press("Escape");
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(points(page)).toHaveCount(2);
    await expect(button(page, strings.phone.menu.button)).toBeFocused();
    await pickFromMenu(page, strings.phone.menu.newTrip);
    await expectInitialFocus(page);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(points(page)).toHaveCount(0);
    expect(network.blocked).toEqual([]);
  });
});

test.describe("keyboard alone on a portrait phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const sheet = (page: Page) => page.getByRole("dialog", { name: strings.phone.sheetLabel });

  test("the sheet's handle moves it between its stops; at the peek Tab skips its hidden body", async ({ page }) => {
    await serveOffline(page, routed);
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
    await page.goto("/");
    await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-stop", "peek");
    const row = sheet(page).getByRole("button", { name: new RegExp(`^${strings.legLabel(1)} `) });

    // At the peek the leg rows are off screen, and Tab never lands on them.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.classList.contains("phone-row-toggle"))).toBe(false);
    }

    // Enter on a tab raises the sheet to half; then the rows are reachable and usable.
    const legsTab = sheet(page).getByRole("tab", { name: strings.phone.tabs.legs });
    await legsTab.focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toHaveAttribute("data-stop", "half");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-current", "true");

    // The handle, a slider over the stops: arrow up and down go one stop, Home and End to the ends.
    const handle = sheet(page).getByRole("slider", { name: strings.phone.resizeSheetHandle });
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await expect(sheet(page)).toHaveAttribute("data-stop", "full");
    await page.keyboard.press("ArrowUp");
    await expect(sheet(page)).toHaveAttribute("data-stop", "full");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(sheet(page)).toHaveAttribute("data-stop", "peek");
    await expect(handle).toHaveAttribute("aria-valuetext", strings.phone.sheetStops.peek);
    await page.keyboard.press("End");
    await expect(sheet(page)).toHaveAttribute("data-stop", "full");
    await page.keyboard.press("Home");
    await expect(sheet(page)).toHaveAttribute("data-stop", "peek");
    await expect(handle).toBeFocused();
  });

  test("the autosave warning sits under the menu, clear of the search pill and the right-hand buttons", async ({
    page,
  }) => {
    await serveOffline(page);
    const newer = JSON.stringify({ format: SAVE_FORMAT, version: 3, trip: { name: "From the future" } });
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, newer]);
    await page.goto("/");
    await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const warning = page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion });
    await expect(warning).toBeVisible();
    await expect(warning).toBeInViewport({ ratio: 1 });
    const box = (await warning.boundingBox())!;
    for (const name of [strings.placeSearch.pill(undefined), strings.phone.showPositionButton, strings.mapMenuButton]) {
      const other = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      const overlaps =
        box.x < other.x + other.width && other.x < box.x + box.width && box.y < other.y + other.height && other.y < box.y + box.height;
      expect(overlaps, name).toBe(false);
    }
  });
});
