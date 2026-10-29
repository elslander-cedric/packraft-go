// The phone held sideways (#126, ADR 0026): a full-height side panel on the right replaces the
// sheet, with the same tabs; it collapses to a strip with the totals. Rotating keeps your place.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { brouterFixture, serveOffline } from "./support/offline";
import { touch } from "./support/touch";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const PORTRAIT = viewport;
const SIDEWAYS = { width: viewport.height, height: viewport.width };

const routed = { brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }) };

const text = strings.phone;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: text.sheetLabel });
const panelTab = (page: Page, name: string) => panel(page).getByRole("tab", { name });
const collapse = (page: Page) => panel(page).getByRole("button", { name: text.collapsePanelButton });
const expand = (page: Page) => panel(page).getByRole("button", { name: text.expandPanelButton });
const points = (page: Page) => mapRegion(page).locator("path.point");
const splitter = (page: Page) => panel(page).getByRole("separator", { name: text.resizePanelHandle });
const panelWidth = async (page: Page) => (await panel(page).boundingBox())!.width;

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Waits for the fonts and for the panel's and the sheet's animations to end. */
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
}

/** Taps the map at an offset from the centre of the part the panel leaves free. */
async function tapMap(page: Page, dx: number, dy: number) {
  const free = (await mapRegion(page).boundingBox())!;
  const covered = (await panel(page).boundingBox())!;
  const width = covered.x - free.x;
  await page.touchscreen.tap(free.x + width / 2 + dx, free.y + free.height / 2 + dy);
}

test("sideways, a side panel on the right shows the tabs; collapsed, a strip with the totals; the map stays editable", async ({
  page,
}) => {
  await page.setViewportSize(SIDEWAYS);
  await serveOffline(page, routed);
  await openPhone(page);
  await settled(page);

  await expect(sheet(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  // On first load the panel is open, 380 px wide (ADR 0034).
  await expect(collapse(page)).toBeVisible();
  const box = (await panel(page).boundingBox())!;
  // Full height, on the right.
  expect(box.y).toBe(0);
  expect(box.height).toBe(SIDEWAYS.height);
  expect(box.x + box.width).toBe(SIDEWAYS.width);
  expect(box.width).toBe(380);
  for (const name of Object.values(text.tabs)) await expect(panelTab(page, name)).toBeAttached();
  await panelTab(page, text.tabs.days).click();
  await expect(panelTab(page, text.tabs.days)).toHaveAttribute("aria-selected", "true");

  // The map beside the open panel takes taps.
  await tapMap(page, -80, 0);
  await tapMap(page, 40, 30);
  await expect(points(page)).toHaveCount(2);

  await collapse(page).click();
  await settled(page);
  const strip = (await panel(page).boundingBox())!;
  expect(strip.width).toBeLessThan(100);
  expect(strip.x + strip.width).toBe(SIDEWAYS.width);
  await expect(panel(page).locator(".phone-totals")).toBeVisible();
  await expect(panel(page).locator(".phone-totals")).toContainText(strings.kilometreUnit);
  // Every total fits inside the strip.
  const fits = await panel(page)
    .locator(".phone-totals > span")
    .evaluateAll((spans) => spans.every((s) => s.scrollWidth <= s.parentElement!.parentElement!.clientWidth));
  expect(fits).toBe(true);

  // With the strip the map takes taps nearly to the right edge.
  await tapMap(page, 200, 0);
  await expect(points(page)).toHaveCount(3);
});

const sheetTab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });
/** The open leg row's button, in whichever of the sheet or the panel shows the trip. */
const rowButton = (page: Page, n: number) =>
  page
    .getByRole("list", { name: strings.legsPanelLabel })
    .getByRole("listitem")
    .nth(n - 1)
    .getByRole("button", { name: strings.legLabel(n), exact: false })
    .first();

/** How much of the screen the sheet covers, in pixels. */
async function sheetHeight(page: Page) {
  const box = (await sheet(page).boundingBox())!;
  return page.viewportSize()!.height - box.y;
}

/** Drags the sheet by its handle area, with the mouse. */
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

async function centreOf(page: Page, n: number) {
  const box = (await points(page).nth(n).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("rotating keeps the open tab, the tapped leg row and the selected point; the panel keeps its own state and the sheet its stop", async ({
  page,
}) => {
  await serveOffline(page, routed);
  await openPhone(page);
  const screen = PORTRAIT.height;

  // Portrait: three points, the middle one selected, the Legs tab, leg 2 tapped.
  const map = (await mapRegion(page).boundingBox())!;
  for (const [dx, dy] of [
    [-120, 0],
    [0, 40],
    [120, 0],
  ])
    await page.touchscreen.tap(map.x + map.width / 2 + dx, map.y + map.height / 3 + dy);
  await expect(points(page)).toHaveCount(3);
  const middle = await centreOf(page, 1);
  await page.touchscreen.tap(middle.x, middle.y);
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);
  await sheetTab(page, text.tabs.legs).click();
  await rowButton(page, 2).click();
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.45);

  // Sideways: the panel is open, as on first load (ADR 0034), with the same place kept.
  await page.setViewportSize(SIDEWAYS);
  await expect(sheet(page)).toHaveCount(0);
  await expect(collapse(page)).toBeVisible();
  await expect(panelTab(page, text.tabs.legs)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 2)).toBeVisible();
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);

  // Collapsing the panel doesn't change the sheet's last stop: back in portrait it is at half.
  await collapse(page).click();
  await page.setViewportSize(PORTRAIT);
  await expect(sheet(page)).toBeVisible();
  await settled(page);
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(screen * 0.55);
  await expect(sheetTab(page, text.tabs.legs)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 2)).toBeVisible();
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);

  // With the sheet at 90% the panel stays collapsed, as it was left; the sheet comes back at 90%.
  await dragSheet(page, -(screen * 0.4));
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.85);
  await page.setViewportSize(SIDEWAYS);
  await expect(expand(page)).toBeVisible();
  await page.setViewportSize(PORTRAIT);
  await settled(page);
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.85);

  // With the sheet at its peek the panel is still collapsed; opening it shows the tab that was open.
  await dragSheet(page, screen);
  await expect.poll(() => sheetHeight(page)).toBeLessThan(140);
  await page.setViewportSize(SIDEWAYS);
  await expect(expand(page)).toBeVisible();
  await expect(panel(page).locator(".phone-totals")).toBeVisible();
  await expand(page).click();
  await expect(panelTab(page, text.tabs.legs)).toHaveAttribute("aria-selected", "true");
  // Opening the panel doesn't raise the sheet: back in portrait it is at its peek.
  await page.setViewportSize(PORTRAIT);
  await settled(page);
  await expect.poll(() => sheetHeight(page)).toBeLessThan(140);

  // The panel left open stays open, though the sheet is at its peek.
  await page.setViewportSize(SIDEWAYS);
  await expect(collapse(page)).toBeVisible();
});

test("sideways, the floating buttons stay in their corners over the map, beside the panel, fully visible", async ({
  page,
}) => {
  await page.setViewportSize(SIDEWAYS);
  await serveOffline(page, routed);
  await openPhone(page);
  await expect(panel(page)).toBeVisible();
  await settled(page);
  await tapMap(page, -80, 0);
  await expect(points(page)).toHaveCount(1);
  // (The map centres on the first point, so the second tap keeps well clear of the centre.)
  await tapMap(page, 160, -60);
  await expect(points(page)).toHaveCount(2);
  // With a point selected every bottom-right button shows.
  const second = await centreOf(page, 1);
  await page.touchscreen.tap(second.x, second.y);
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);

  const buttons = [
    page.getByRole("button", { name: text.menu.button }),
    page.getByRole("button", { name: text.showPositionButton }),
    page.getByRole("button", { name: strings.mapMenuButton, exact: true }),
    page.getByRole("button", { name: text.selectedPointToAccessPointButton }),
    page.getByRole("button", { name: strings.deletePointButton }),
    page.getByRole("button", { name: strings.campButton }),
    page.getByRole("group", { name: text.nextLegModeLabel }),
    page.getByRole("button", { name: strings.undoButton }),
  ];
  await collapse(page).click();
  for (const open of [false, true]) {
    if (open) await expand(page).click();
    await settled(page);
    const covered = (await panel(page).boundingBox())!;
    for (const button of buttons) {
      const box = (await button.boundingBox())!;
      const label = `${await button.getAttribute("aria-label")} (panel ${open ? "open" : "collapsed"})`;
      expect(box.x, label).toBeGreaterThanOrEqual(0);
      expect(box.y, label).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, label).toBeLessThanOrEqual(SIDEWAYS.height);
      expect(box.x + box.width, label).toBeLessThanOrEqual(covered.x);
      // Nothing lies over it: its centre and four spots near its edge (inside a round button) hit it.
      const hit = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const [dx, dy] = [r.width * 0.2, r.height * 0.2];
        const spots = [
          [r.left + dx, r.top + dy],
          [r.right - dx, r.top + dy],
          [r.left + dx, r.bottom - dy],
          [r.right - dx, r.bottom - dy],
          [r.left + r.width / 2, r.top + r.height / 2],
        ];
        return spots.every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
      });
      expect(hit, label).toBe(true);
    }
  }
  // The left-hand buttons are on the left, the others on the right, beside the panel.
  const menu = (await buttons[0].boundingBox())!;
  const undo = (await buttons[buttons.length - 1].boundingBox())!;
  const covered = (await panel(page).boundingBox())!;
  expect(menu.x).toBeLessThan(40);
  expect(covered.x - (undo.x + undo.width)).toBeLessThan(40);
});

test("sideways, the Settings dialog from the menu fits the short screen with Save and Cancel in reach (#151)", async ({
  page,
}) => {
  await page.setViewportSize(SIDEWAYS);
  await serveOffline(page);
  await openPhone(page);
  await page.getByRole("button", { name: text.menu.button }).click();
  await page.getByRole("menuitem", { name: text.menu.settings, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: strings.settingsPanelLabel });
  await expect(dialog.getByLabel(strings.paceFactorLabel)).toBeVisible();
  for (const name of [text.menu.settingsConfirm, strings.confirmCancel]) {
    const button = dialog.getByRole("button", { name });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport({ ratio: 1 });
  }
});

test("sideways, dragging the panel's left edge resizes it, between 320 px and half the screen (ADR 0034)", async ({
  page,
}) => {
  await page.setViewportSize(SIDEWAYS);
  await serveOffline(page);
  await openPhone(page);
  await settled(page);
  expect(await panelWidth(page)).toBe(380);
  const fingers = await touch(page);
  const edge = async () => {
    const box = (await splitter(page).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  // Wider by 30 px.
  let from = await edge();
  await fingers.drag(from, { x: from.x - 30, y: from.y + 20 });
  await settled(page);
  expect(await panelWidth(page)).toBe(410);
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", "410");

  // No wider than half the screen.
  from = await edge();
  await fingers.drag(from, { x: from.x - 300, y: from.y });
  await settled(page);
  expect(await panelWidth(page)).toBe(Math.floor(SIDEWAYS.width / 2));

  // No narrower than 320 px, with the mouse too.
  from = await edge();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 250, from.y, { steps: 5 });
  await page.mouse.move(from.x + 600, from.y, { steps: 5 });
  await page.mouse.up();
  await settled(page);
  expect(await panelWidth(page)).toBe(320);

  // Dragging the edge adds no point to the map.
  await expect(points(page)).toHaveCount(0);
});

test("sideways, the arrow keys on the panel's edge resize it, within its limits (ADR 0034)", async ({ page }) => {
  await page.setViewportSize(SIDEWAYS);
  await serveOffline(page);
  await openPhone(page);
  await settled(page);
  const max = Math.floor(SIDEWAYS.width / 2);
  await expect(splitter(page)).toHaveAttribute("aria-valuemin", "320");
  await expect(splitter(page)).toHaveAttribute("aria-valuemax", String(max));

  await splitter(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", "400");
  await settled(page);
  expect(await panelWidth(page)).toBe(400);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", "360");

  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", "320");
  await page.keyboard.press("End");
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", String(max));
  await page.keyboard.press("Home");
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", "320");
  await settled(page);
  expect(await panelWidth(page)).toBe(320);
});

test("sideways, the panel's width and whether it is open survive a reload, in the settings and not the trip", async ({
  page,
}) => {
  await page.setViewportSize(SIDEWAYS);
  await serveOffline(page);
  await openPhone(page);
  await splitter(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(splitter(page)).toHaveAttribute("aria-valuenow", "400");
  await collapse(page).click();
  await expect
    .poll(async () => JSON.parse((await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)) ?? "{}"))
    .toMatchObject({ sidePanelWidth: 400, sidePanelOpen: false });
  expect((await page.evaluate((key) => localStorage.getItem(key), TRIP_KEY)) ?? "").not.toMatch(/sidePanel/);

  await page.reload();
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(expand(page)).toBeVisible();
  await expect(splitter(page)).toHaveCount(0);
  await expand(page).click();
  await settled(page);
  expect(await panelWidth(page)).toBe(400);

  // Open survives a reload too.
  await page.reload();
  await expect(collapse(page)).toBeVisible();
  await settled(page);
  expect(await panelWidth(page)).toBe(400);
});
