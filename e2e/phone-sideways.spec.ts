// The phone held sideways (#126, ADR 0026): a full-height side panel on the right replaces the
// sheet, with the same tabs; it collapses to a strip with the totals. Rotating keeps your place.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";

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
  // The panel starts like the sheet's peek: collapsed to the strip with the totals.
  await expect(expand(page)).toBeVisible();
  await expect(panel(page).locator(".phone-totals")).toBeVisible();
  await expect(panelTab(page, text.tabs.legs)).toHaveCount(0);

  await expand(page).click();
  await settled(page);
  const box = (await panel(page).boundingBox())!;
  // Full height, on the right, about 45% of the width and at most 380 px.
  expect(box.y).toBe(0);
  expect(box.height).toBe(SIDEWAYS.height);
  expect(box.x + box.width).toBe(SIDEWAYS.width);
  expect(box.width).toBeLessThanOrEqual(380);
  expect(box.width).toBeGreaterThan(SIDEWAYS.width * 0.3);
  for (const name of Object.values(text.tabs)) await expect(panelTab(page, name)).toBeAttached();
  await panelTab(page, text.tabs.settings).click();
  await expect(panelTab(page, text.tabs.settings)).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByLabel(strings.paceFactorLabel)).toBeVisible();

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

test("rotating keeps the open tab, the open leg row and the selected point; the sheet's stop maps to the panel and back", async ({
  page,
}) => {
  await serveOffline(page, routed);
  await openPhone(page);
  const screen = PORTRAIT.height;

  // Portrait: three points, the middle one selected, the Legs tab with leg 2 open.
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
  await expect(rowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.45);

  // Sideways: the sheet at half becomes the open panel, with the same place kept.
  await page.setViewportSize(SIDEWAYS);
  await expect(sheet(page)).toHaveCount(0);
  await expect(collapse(page)).toBeVisible();
  await expect(panelTab(page, text.tabs.legs)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);

  // Collapsing the panel doesn't change the sheet's last stop: back in portrait it is at half.
  await collapse(page).click();
  await page.setViewportSize(PORTRAIT);
  await expect(sheet(page)).toBeVisible();
  await settled(page);
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(screen * 0.55);
  await expect(sheetTab(page, text.tabs.legs)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);

  // At 90% the sheet also becomes the open panel, and comes back at 90%.
  await dragSheet(page, -(screen * 0.4));
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.85);
  await page.setViewportSize(SIDEWAYS);
  await expect(collapse(page)).toBeVisible();
  await page.setViewportSize(PORTRAIT);
  await settled(page);
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(screen * 0.85);

  // At its peek the sheet becomes the collapsed panel, and comes back at its peek.
  await dragSheet(page, screen);
  await expect.poll(() => sheetHeight(page)).toBeLessThan(140);
  await page.setViewportSize(SIDEWAYS);
  await expect(expand(page)).toBeVisible();
  await expect(panel(page).locator(".phone-totals")).toBeVisible();
  // Opening the panel shows the tab that was open.
  await expand(page).click();
  await expect(panelTab(page, text.tabs.legs)).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize(PORTRAIT);
  await settled(page);
  await expect.poll(() => sheetHeight(page)).toBeLessThan(140);
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
    page.getByRole("button", { name: strings.accessLayerToggle, exact: true }),
    page.getByRole("button", { name: text.selectedPointToAccessPointButton }),
    page.getByRole("button", { name: strings.deletePointButton }),
    page.getByRole("button", { name: strings.campButton }),
    page.getByRole("group", { name: text.nextLegModeLabel }),
    page.getByRole("button", { name: strings.undoButton }),
  ];
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
