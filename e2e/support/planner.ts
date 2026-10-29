// The one planner (ADR 0034) as the ported desktop specs drive it: a wide window with the
// trip panel on the right, the floating buttons over the map and the menu top left.
import { expect, type Locator, type Page } from "@playwright/test";
import { strings } from "../../src/ui/strings";

const text = strings.phone;

export const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });

/** The trip panel on the right (the bottom sheet on a phone in portrait). */
export const tripPanel = (page: Page) => page.getByRole("complementary", { name: text.sheetLabel });

/** One of the panel's tabs. */
export const panelTab = (page: Page, name: string) => tripPanel(page).getByRole("tab", { name });

/** The Legs tab's rows. */
export const legRows = (page: Page) =>
  tripPanel(page).getByRole("list", { name: strings.legsPanelLabel }).getByRole("listitem");

/** Leg `n`'s row button (1-based), which zooms the map to its leg. */
export const legRowButton = (page: Page, n: number) =>
  legRows(page)
    .nth(n - 1)
    .getByRole("button", { name: strings.legLabel(n), exact: false })
    .first();

/** Shows one of the panel's tabs (only the shown tab's content is in the page). */
export async function showTab(page: Page, name: string) {
  const tab = panelTab(page, name);
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** The Days tab's day cards (shown with `showTab(page, strings.phone.tabs.days)`). */
export const dayCards = (page: Page) =>
  tripPanel(page).getByRole("complementary", { name: strings.daysPanelLabel }).getByRole("listitem");

/** The trip's totals in the panel's header. */
export const totals = (page: Page) => tripPanel(page).locator(".phone-totals");

export const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
export const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");

/** Opens the planner and waits for the map's tiles and the panel. */
export async function openPlanner(page: Page, path = "/") {
  await page.goto(path);
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  // The side panel, or the bottom sheet on a narrow screen in portrait.
  await expect(tripPanel(page).or(page.getByRole("dialog", { name: text.sheetLabel }))).toBeVisible();
}

/** The part of the map the panel leaves free, in viewport pixels. */
export async function freeMapBox(page: Page) {
  const map = (await mapRegion(page).boundingBox())!;
  // No side panel on a narrow screen in portrait: the whole map's width is free.
  const panel = (await tripPanel(page).count()) > 0 ? await tripPanel(page).boundingBox() : null;
  const right = panel ? panel.x : map.x + map.width;
  return { x: map.x, y: map.y, width: right - map.x, height: map.height };
}

/** The centre of the part of the map the panel leaves free, in viewport pixels. */
export async function freeMapCentre(page: Page) {
  const free = await freeMapBox(page);
  return { x: free.x + free.width / 2, y: free.y + free.height / 2 };
}

/** Kilometres in a shown figure such as "12.3 km". */
export async function km(locator: Locator) {
  const shown = (await locator.textContent()) ?? "";
  const m = shown.match(/([\d.,]+)\s*km/);
  if (!m) throw new Error(`no distance in "${shown}"`);
  return Number(m[1].replace(",", ""));
}

/** The figure named `label` in `within` (e.g. a row's or the totals' "Hike distance"), as shown. */
export async function figure(within: Locator, label: string) {
  const all = await within.locator(".phone-row-figure, .phone-total, .day-figure").allTextContents();
  const found = all.find((shown) => shown.startsWith(`${label} `));
  if (found === undefined) throw new Error(`no "${label}" in ${JSON.stringify(all)}`);
  return found.slice(label.length + 1);
}

export const menuButton = (page: Page) => page.getByRole("button", { name: text.menu.button, exact: true });

/** Opens the menu top left and picks `item` (one of `strings.phone.menu`'s items). */
export async function menuItem(page: Page, item: string) {
  await menuButton(page).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

export const tripDetailsDialog = (page: Page) => page.getByRole("dialog", { name: text.menu.tripDetailsTitle });
export const settingsDialog = (page: Page) => page.getByRole("dialog", { name: strings.settingsPanelLabel });

/** Menu → Edit trip, then sets the trip's name and saves. */
export async function renameTrip(page: Page, name: string) {
  await menuItem(page, text.menu.tripDetails);
  await tripDetailsDialog(page).getByLabel(strings.tripNameLabel).fill(name);
  await tripDetailsDialog(page).getByRole("button", { name: text.menu.tripDetailsConfirm }).click();
  await expect(tripDetailsDialog(page)).toHaveCount(0);
}

/** Menu → Edit trip, then sets the start date ("YYYY-MM-DD", or "" to clear it) and saves. */
export async function setStartDate(page: Page, date: string) {
  await menuItem(page, text.menu.tripDetails);
  const dialog = tripDetailsDialog(page);
  if (date === "") await dialog.getByRole("button", { name: strings.clearStartDateButton }).click();
  else await dialog.getByLabel(strings.startDateLabel).fill(date);
  await dialog.getByRole("button", { name: text.menu.tripDetailsConfirm }).click();
  await expect(dialog).toHaveCount(0);
}

/** Menu → Settings, then sets the given fields and saves. */
export async function changeSettings(page: Page, values: { paceFactor?: string; paddleSpeed?: string }) {
  await menuItem(page, text.menu.settings);
  const dialog = settingsDialog(page);
  if (values.paceFactor !== undefined) await dialog.getByLabel(strings.paceFactorLabel).fill(values.paceFactor);
  if (values.paddleSpeed !== undefined) await dialog.getByLabel(strings.paddleSpeedLabel).fill(values.paddleSpeed);
  await dialog.getByRole("button", { name: text.menu.settingsConfirm }).click();
  await expect(dialog).toHaveCount(0);
}

/** The floating hike / paddle toggle for the next leg. */
export const nextLegMode = (page: Page, mode: string) =>
  page.getByRole("group", { name: text.nextLegModeLabel }).getByRole("button", { name: mode });

export const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton, exact: true });

/** Picks the mode the next leg is drawn with (a drawn leg's mode can't be changed, ADR 0034). */
export async function pickNextMode(page: Page, mode: "hike" | "paddle") {
  await nextLegMode(page, mode === "hike" ? strings.legModeHike : strings.legModePaddle).click();
}

/**
 * A function that clicks the map at an offset from the centre of the part the panel leaves
 * free, optionally drawing the leg it adds with `mode`.
 */
export async function mapClicker(page: Page) {
  const centre = await freeMapCentre(page);
  let last: { x: number; y: number; at: number } | null = null;
  return async (dx: number, dy: number, mode?: "hike" | "paddle") => {
    if (mode) await pickNextMode(page, mode);
    const at = { x: centre.x + dx, y: centre.y + dy };
    // A second click on the same spot within 0.4 s is a double tap, which gives one tap.
    if (last && Math.hypot(at.x - last.x, at.y - last.y) < 40) {
      const wait = 450 - (Date.now() - last.at);
      if (wait > 0) await page.waitForTimeout(wait);
    }
    await page.mouse.click(at.x, at.y);
    last = { ...at, at: Date.now() };
  };
}

type ChosenFile = string | { name: string; mimeType: string; buffer: Buffer };

/** Menu → Open trip, choosing `file` (a path, or a file's name, type and content). */
export async function openTripFile(page: Page, file: ChosenFile) {
  await menuButton(page).click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("menuitem", { name: text.menu.openFile, exact: true }).click(),
  ]);
  await chooser.setFiles(file);
}

/** Menu → Save trip or Export GPX, confirming the name dialog (renamed to `name` if given); returns the download. */
async function downloadFromMenu(page: Page, item: string, title: string, confirm: string, name?: string) {
  await menuItem(page, item);
  const dialog = page.getByRole("dialog", { name: title });
  if (name !== undefined) await dialog.getByLabel(strings.tripNameLabel).fill(name);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: confirm }).click(),
  ]);
  await expect(dialog).toHaveCount(0);
  return download;
}

/** Menu → Save trip; returns the download. */
export const saveTripFile = (page: Page, name?: string) =>
  downloadFromMenu(page, text.menu.saveFile, text.menu.saveTitle, text.menu.saveConfirm, name);

/** Menu → Export GPX; returns the download. */
export const exportGpxFile = (page: Page, name?: string) =>
  downloadFromMenu(page, text.menu.exportGpx, text.menu.exportTitle, text.menu.exportConfirm, name);

/** The trip's name as the Edit trip dialog shows it (the dialog is closed again). */
export async function shownTripName(page: Page) {
  await menuItem(page, text.menu.tripDetails);
  const dialog = tripDetailsDialog(page);
  const name = await dialog.getByLabel(strings.tripNameLabel).inputValue();
  await dialog.getByRole("button", { name: strings.confirmCancel }).click();
  await expect(dialog).toHaveCount(0);
  return name;
}

/** Waits until the Edit trip dialog shows `name` as the trip's name. */
export async function expectTripName(page: Page, name: string) {
  await expect.poll(() => shownTripName(page)).toBe(name);
}

/** Menu → Export GPX → Export, keeping the prefilled name: starts the ZIP's download (with `downloadGpxZip`). */
export async function startGpxExport(page: Page) {
  await menuItem(page, text.menu.exportGpx);
  const dialog = page.getByRole("dialog", { name: text.menu.exportTitle });
  await dialog.getByRole("button", { name: text.menu.exportConfirm }).click();
}

/** The menu's Export GPX item, disabled while the trip has no leg; the menu is closed again. */
export async function exportGpxDisabled(page: Page) {
  await menuButton(page).click();
  const disabled = (await page.getByRole("menuitem", { name: text.menu.exportGpx, exact: true }).getAttribute("aria-disabled")) === "true";
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  return disabled;
}

/** Holds the mouse still on `at` for `ms` milliseconds: 0.4 s or more is a hold (ADR 0034). */
export async function mouseHold(page: Page, at: { x: number; y: number }, ms = 550) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** An access point's details dialog (Save stores it on the device). */
export const accessPointDialog = (page: Page) => page.getByRole("dialog", { name: text.accessPointDialogTitle });

/**
 * Marks an access point by the floating button, then a click on the map at `at` (without a
 * position fix the button starts place mode). Leaves the new point's dialog open.
 */
export async function markAccessPointAt(page: Page, at: { x: number; y: number }) {
  await page.getByRole("button", { name: text.markAccessPointButton, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: text.placingState })).toBeVisible();
  await page.mouse.click(at.x, at.y);
  await expect(accessPointDialog(page)).toBeVisible();
}

/** Opens the dialog of the selected access point from its row in the Access points tab. */
export async function editSelectedAccessPoint(page: Page) {
  const row = tripPanel(page).locator(".phone-access-point-item:has([aria-current])");
  await row.getByRole("button").nth(1).click();
  await expect(accessPointDialog(page)).toBeVisible();
}

/** Saves the open access point dialog. */
export async function saveAccessPoint(page: Page) {
  await accessPointDialog(page).getByRole("button", { name: text.accessPointSave }).click();
  await expect(accessPointDialog(page)).toHaveCount(0);
}

/**
 * A point on an SVG path (a water, a leg), in viewport pixels, in the part of the map that the
 * panel and the floating buttons leave free, where no other shape lies on top of it; the nearest
 * such point to the path's middle.
 */
export async function pointOnPath(page: Page, path: Locator) {
  const free = await freeMapBox(page);
  const area = { minX: free.x + 80, maxX: free.x + free.width - 80, minY: free.y + 140, maxY: free.y + free.height - 140 };
  const at = await path.first().evaluate((element, { minX, maxX, minY, maxY }) => {
    const svg = element as SVGPathElement;
    const length = svg.getTotalLength();
    const m = svg.getScreenCTM()!;
    for (let step = 0; step <= 50; step++) {
      // 0.5, 0.51, 0.49, 0.52, …: outwards from the middle.
      const share = 0.5 + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 0.01;
      const p = svg.getPointAtLength(length * share);
      const x = p.x * m.a + p.y * m.c + m.e;
      const y = p.x * m.b + p.y * m.d + m.f;
      if (x > minX && x < maxX && y > minY && y < maxY && document.elementFromPoint(x, y) === svg) return { x, y };
    }
    return null;
  }, area);
  if (!at) throw new Error("no part of the path is in the free part of the map");
  return at;
}

/** The start date the Edit trip dialog shows, "" when undated (the dialog is closed again). */
export async function shownStartDate(page: Page) {
  await menuItem(page, text.menu.tripDetails);
  const dialog = tripDetailsDialog(page);
  const value = await dialog.getByLabel(strings.startDateLabel).inputValue();
  await dialog.getByRole("button", { name: strings.confirmCancel }).click();
  await expect(dialog).toHaveCount(0);
  return value;
}

/** The day cards' dates as their tiles are named (e.g. "Sat 24 Oct 2026"); [] when undated. Shows the Days tab. */
export async function dayCardDates(page: Page) {
  await showTab(page, text.tabs.days);
  return dayCards(page)
    .locator(".day-tile:has(time)")
    .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("aria-label")));
}

/** Pans the map (dragging empty map) until the middle of `path` is at the centre of the free part. */
export async function panToPath(page: Page, path: Locator) {
  const middle = await path.first().evaluate((element) => {
    const svg = element as SVGPathElement;
    const p = svg.getPointAtLength(svg.getTotalLength() / 2);
    const m = svg.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  const centre = await freeMapCentre(page);
  // Drag from a spot in the free part, by the distance from the path's middle to the centre.
  const from = { x: centre.x + 100, y: centre.y + 100 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (centre.x - middle.x), from.y + (centre.y - middle.y), { steps: 20 });
  await page.waitForTimeout(200); // stop still, so the map doesn't glide on
  await page.mouse.up();
  await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-pan-anim/);
  await page.waitForTimeout(300);
}

/** A water of the access layer, by its record's id. */
export const accessWater = (page: Page, id: string) => page.locator(`path.access-record-${id}`);

/**
 * Holds a water (0.4 s) to open its details; a click there would plan (ADR 0034). The water may
 * be behind the panel: it is brought into the free part of the map first.
 */
export async function holdWater(page: Page, id: string) {
  await panToPath(page, accessWater(page, id));
  await mouseHold(page, await pointOnPath(page, accessWater(page, id)));
}

/** The open leg's details dialog (#158), titled "Leg n · mode · distance" (`strings.phone.legDetailsTitle`). */
export const legDetailsDialog = (page: Page) => page.getByRole("dialog", { name: /^Leg \d+ · / });

/** Opens leg `n`'s details dialog from its row's info button. */
export async function openLegDetails(page: Page, n: number) {
  await legRows(page)
    .nth(n - 1)
    .getByRole("button", { name: text.legDetailsButton(n) })
    .click();
  await expect(legDetailsDialog(page)).toBeVisible();
  return legDetailsDialog(page);
}

/** Closes the leg's details dialog. */
export async function closeLegDetails(page: Page) {
  await legDetailsDialog(page).getByRole("button", { name: text.legDetailsClose }).click();
  await expect(legDetailsDialog(page)).toHaveCount(0);
}
