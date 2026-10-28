// The phone planner's Days tab (#123, ADR 0026) and its Trip details and Settings dialogs
// from the menu (#154, #151): day cards that zoom the map to their day and carry its access,
// the trip's name and start date, and the planner's settings stored on the device. The trip is seeded in browser storage with
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
/** A day card's warning chips (ADR 0029). */
const dayChips = (page: Page, day: number) =>
  dayCards(page).nth(day).getByRole("group", { name: strings.tripAccess.dayWarningsLabel }).getByRole("button");
/** A day card's title: its calendar tile, named by the full date (or "Day n" when undated). */
// The tile is the card's first button; its warning chips follow.
const dayTile = (card: Locator) => card.getByRole("button").first();
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const detailsDialog = (page: Page) => page.getByRole("dialog", { name: text.menu.tripDetailsTitle });
const tripName = (page: Page) => detailsDialog(page).getByLabel(strings.tripNameLabel);
const startDate = (page: Page) => detailsDialog(page).getByLabel(strings.startDateLabel);
const clearDate = (page: Page) => detailsDialog(page).getByRole("button", { name: strings.clearStartDateButton });
const saveDetails = (page: Page) => detailsDialog(page).getByRole("button", { name: text.menu.tripDetailsConfirm });
const cancelDetails = (page: Page) => detailsDialog(page).getByRole("button", { name: strings.confirmCancel });
const settingsDialog = (page: Page) => page.getByRole("dialog", { name: strings.settingsPanelLabel });
const paceFactor = (page: Page) => settingsDialog(page).getByLabel(strings.paceFactorLabel);
const paddleSpeed = (page: Page) => settingsDialog(page).getByLabel(strings.paddleSpeedLabel);
const saveSettings = (page: Page) => settingsDialog(page).getByRole("button", { name: text.menu.settingsConfirm });
const cancelSettings = (page: Page) => settingsDialog(page).getByRole("button", { name: strings.confirmCancel });
const menuButton = (page: Page) => page.getByRole("button", { name: text.menu.button });
/** Menu → Settings: the settings dialog. */
async function openSettings(page: Page) {
  await menuButton(page).click();
  await page.getByRole("menuitem", { name: text.menu.settings, exact: true }).click();
  await expect(settingsDialog(page)).toBeVisible();
}
/** Menu → Edit trip: the trip's name and start date. */
async function openDetails(page: Page) {
  await menuButton(page).click();
  await page.getByRole("menuitem", { name: text.menu.tripDetails, exact: true }).click();
  await expect(detailsDialog(page)).toBeVisible();
}
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
  // An undated trip's tiles show "Day" and the day's number.
  await expect(dayTile(dayCards(page).nth(0))).toHaveAccessibleName(strings.dayLabel(1));
  // Each figure after its icon, its name read out; a figure that is zero is left out.
  const names = strings.phone.dayFigures;
  await expect(dayCards(page).nth(0)).toContainText(`${names.hike} 4.4 km`);
  await expect(dayCards(page).nth(0)).toContainText(`${names.climb} 35 m`);
  await expect(dayCards(page).nth(0)).toContainText(names.time);
  await expect(dayCards(page).nth(0)).not.toContainText(names.paddle);
  await expect(dayCards(page).nth(1)).toContainText(names.paddle);
  // The figures start level with the top of the calendar tile.
  const [body, tile] = await Promise.all([
    dayCards(page).nth(1).locator(".day-card-body").boundingBox(),
    dayTile(dayCards(page).nth(1)).boundingBox(),
  ]);
  expect(Math.abs(body!.y - tile!.y)).toBeLessThanOrEqual(1);
  // The paddle day is on unlisted Walloon water: not allowed, never "unknown" (#75).
  await expect(dayChips(page, 1)).toContainText(strings.tripAccess.chip(2, strings.tripAccess.chipKind.forbidden));

  // The tapped card is marked by the accent bar on its left, the other has none.
  const bar = (n: number) => dayCards(page).nth(n).evaluate((el) => getComputedStyle(el).borderLeftColor);
  const transparent = "rgba(0, 0, 0, 0)";
  expect(await bar(1)).toBe(transparent);
  await dayCards(page).nth(1).tap();
  await expect.poll(() => bar(1)).not.toBe(transparent);
  expect(await bar(0)).toBe(transparent);
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
  // Both measured in one frame: the sheet may still be sliding to its stop.
  const gap = await dayCards(page)
    .nth(0)
    .evaluate((first) => {
      const a = first.getBoundingClientRect();
      const b = first.nextElementSibling!.getBoundingClientRect();
      return Math.round(b.top - a.bottom);
    });
  expect(gap).toBe(0);
  await expect(dayCards(page).nth(0)).toHaveCSS("border-bottom-width", "1px");
});

test("the sheet has no Trip or Settings tab; the menu's Settings opens a dialog without a heading of its own", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  await expect(sheet(page).getByRole("tab")).toHaveText([text.tabs.legs, text.tabs.days, text.tabs.accessPoints]);

  await openSettings(page);
  // The dialog's title is its only heading: it already names the fields.
  await expect(settingsDialog(page).getByRole("heading")).toHaveCount(1);
  await expect(settingsDialog(page).getByRole("region", { name: strings.settingsPanelLabel })).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(paceFactor(page)).toBeFocused();
  await expect(saveSettings(page)).toBeInViewport({ ratio: 1 });
  await expect(cancelSettings(page)).toBeInViewport({ ratio: 1 });
});

test("Edit trip renames the trip and sets, changes and clears its start date on Save; all autosaved, no date drift", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  await openDetails(page);

  await expect(tripName(page)).toHaveValue("Dinant weekend");
  await expect(startDate(page)).toHaveValue("");
  await expect(clearDate(page)).toHaveCount(0);
  await tripName(page).fill("Meuse & Lesse");
  await startDate(page).fill("2026-10-31");
  // Typing is a draft: nothing changes until Save.
  expect((await storedTrip(page)).trip.name).toBe("Dinant weekend");
  await saveDetails(page).click();
  await expect(detailsDialog(page)).toHaveCount(0);
  await expect.poll(async () => (await storedTrip(page)).trip.name).toBe("Meuse & Lesse");
  await expect.poll(async () => (await storedTrip(page)).trip.startDate).toBe("2026-10-31");
  await tab(page, text.tabs.days).click();
  // A dated day's title is its date on a calendar tile, never "Day n".
  await expect(dayTile(dayCards(page).nth(0))).toHaveAccessibleName("Sat 31 Oct 2026");
  await expect(dayTile(dayCards(page).nth(0))).toHaveText(/^Sat\s*31\s*Oct$/);
  await expect(dayTile(dayCards(page).nth(1))).toHaveAccessibleName("Sun 1 Nov 2026");
  await expect(dayTile(dayCards(page).nth(1))).toHaveText(/^Sun\s*1\s*Nov$/);
  await expect(dayCards(page).nth(0)).not.toContainText(strings.dayTileWord);

  await openDetails(page);
  await startDate(page).fill("2027-07-10");
  // Enter in a field saves.
  await startDate(page).press("Enter");
  await expect(detailsDialog(page)).toHaveCount(0);
  await expect.poll(async () => (await storedTrip(page)).trip.startDate).toBe("2027-07-10");
  await page.reload();
  await openDetails(page);
  await expect(startDate(page)).toHaveValue("2027-07-10");
  await expect(tripName(page)).toHaveValue("Meuse & Lesse");
  await cancelDetails(page).click();
  await tab(page, text.tabs.days).click();
  await expect(dayTile(dayCards(page).nth(0))).toHaveAccessibleName("Sat 10 Jul 2027");
  await expect(dayTile(dayCards(page).nth(1))).toHaveAccessibleName("Sun 11 Jul 2027");

  await openDetails(page);
  await clearDate(page).click();
  await expect(startDate(page)).toHaveValue("");
  await expect(clearDate(page)).toHaveCount(0);
  await saveDetails(page).click();
  await expect.poll(async () => (await storedTrip(page)).trip.startDate).toBeUndefined();
  await tab(page, text.tabs.days).click();
  await expect(dayCards(page)).toHaveCount(2);
  await expect(dayCards(page).nth(1)).not.toContainText("Jul");
  await expect(dayTile(dayCards(page).nth(1))).toHaveAccessibleName(strings.dayLabel(2));
});

test("Cancel and Escape drop the Trip details draft, and the next opening starts from the trip", async ({ page }) => {
  await serveOffline(page);
  await openWithTrip(page);
  const before = await storedTrip(page);

  await openDetails(page);
  await tripName(page).fill("Not this");
  await startDate(page).fill("2027-07-10");
  await cancelDetails(page).click();
  await expect(detailsDialog(page)).toHaveCount(0);

  await openDetails(page);
  await expect(tripName(page)).toHaveValue("Dinant weekend");
  await expect(startDate(page)).toHaveValue("");
  await tripName(page).fill("Nor this");
  await page.keyboard.press("Escape");
  await expect(detailsDialog(page)).toHaveCount(0);
  expect(await storedTrip(page)).toEqual(before);
});

test("the Days tab carries the access: a day card's chip opens its leg's details dialog; no disclaimer under the cards", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  await tab(page, text.tabs.days).click();
  // Unlisted Walloon water is not allowed (#75): a Forbidden chip, never "unknown". The cards
  // carry no warning text, selected or not (ADR 0029); the hike day has no chip.
  const forbidden = strings.tripAccess.chipKind.forbidden;
  // Forbidden is the most serious; the put-in and take-out without an aire are the 2 more.
  await expect(dayChips(page, 1)).toHaveAccessibleName(strings.tripAccess.chipName(2, forbidden, 3));
  await expect(dayChips(page, 0)).toHaveCount(0);
  const select = dayTile(dayCards(page).nth(1));
  await dayCards(page).nth(1).tap();
  await expect(select).toHaveAttribute("aria-expanded", "true");
  await expect(dayCards(page).nth(1).locator(".access-warning")).toHaveCount(0);
  await expect(panel(page)).not.toContainText(strings.accessState.unknown);
  // The disclaimer is in the access chip's popover only.
  await expect(panel(page).getByText(strings.navigationRulesNotice)).toHaveCount(0);

  // The chip opens its leg's details dialog over the Days tab (#158), with the warning, and
  // doesn't touch the card's selection; Close goes back to the chip.
  await dayChips(page, 1).tap();
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${strings.legLabel(2)} · ${strings.legModePaddle} · `) });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".access-warning-forbidden")).toContainText(strings.tripAccess.warningKind.forbidden);
  await expect(dialog.locator(".access-warning-aire").first()).toBeVisible();
  await dialog.getByRole("button", { name: text.legDetailsClose }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dayChips(page, 1)).toBeFocused();
  await expect(tab(page, text.tabs.days)).toHaveAttribute("aria-selected", "true");
  await expect(select).toHaveAttribute("aria-expanded", "true");
});

test("pace and paddling speed change the time estimates on Save, survive a reload and are not in the trip", async ({
  page,
}) => {
  await serveOffline(page);
  await openWithTrip(page);
  const time = async () => minutes((await totals(page).textContent())!);
  const before = await time();
  await openSettings(page);
  await expect(paceFactor(page)).toHaveValue("1");
  await expect(paddleSpeed(page)).toHaveValue("5");

  // Typing is a draft: nothing is stored until Save. (The sheet behind the dialog is inert meanwhile.)
  await paceFactor(page).fill("2");
  await paddleSpeed(page).fill("2.5");
  expect(await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).toBeNull();
  await saveSettings(page).click();
  await expect(settingsDialog(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  await expect.poll(time).toBeGreaterThan(before);

  await page.reload();
  await openSettings(page);
  await expect(paceFactor(page)).toHaveValue("2");
  await expect(paddleSpeed(page)).toHaveValue("2.5");
  const settings = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
  expect(settings).toContain("2.5");
  const trip = JSON.stringify(await storedTrip(page));
  expect(trip).not.toMatch(/pace|paddleSpeed/i);
});

test("Cancel and Escape drop the draft, and the next opening starts from the stored settings", async ({ page }) => {
  await serveOffline(page);
  await openWithTrip(page);
  const before = (await totals(page).textContent())!;

  await openSettings(page);
  await paceFactor(page).fill("3");
  await cancelSettings(page).click();
  await expect(settingsDialog(page)).toHaveCount(0);
  await openSettings(page);
  await expect(paceFactor(page)).toHaveValue("1");

  await paddleSpeed(page).fill("1");
  await page.keyboard.press("Escape");
  await expect(settingsDialog(page)).toHaveCount(0);
  await openSettings(page);
  await expect(paddleSpeed(page)).toHaveValue("5");
  await cancelSettings(page).click();

  expect(await totals(page).textContent()).toBe(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).toBeNull();
});

test("Save waits for usable values; Enter in a field saves", async ({ page }) => {
  await serveOffline(page);
  await openWithTrip(page);
  await openSettings(page);

  for (const unusable of ["", "0", "-1"]) {
    await paceFactor(page).fill(unusable);
    await expect(paceFactor(page)).toHaveAttribute("aria-invalid", "true");
    await expect(saveSettings(page)).toBeDisabled();
    // Enter doesn't save an unusable value either.
    await paceFactor(page).press("Enter");
    await expect(settingsDialog(page)).toBeVisible();
  }

  await paceFactor(page).fill("1.5");
  await expect(paceFactor(page)).toHaveAttribute("aria-invalid", "false");
  await expect(saveSettings(page)).toBeEnabled();
  await paceFactor(page).press("Enter");
  await expect(settingsDialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).toContain('"paceFactor":1.5');
});

test.describe("on a narrow phone", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("each day figure stays on one line", async ({ page }) => {
    await serveOffline(page);
    await openWithTrip(page);
    await page.evaluate(() => document.fonts.ready);
    await tab(page, text.tabs.days).click();
    const card = dayCards(page).nth(0);
    const figures = card.locator(".day-figure, .day-legs");
    await expect(figures.first()).toBeVisible();
    for (const figure of await figures.all()) {
      // The icon and the visible text share one line: every box overlaps the first one vertically.
      const oneLine = await figure.evaluate((el) => {
        const boxes = [...el.childNodes].flatMap((node) => {
          if (node instanceof Element && node.classList.contains("visually-hidden")) return [];
          const range = document.createRange();
          range.selectNode(node);
          return [...range.getClientRects()].filter((r) => r.width > 0);
        });
        return boxes.length > 0 && boxes.every((b) => b.top < boxes[0].bottom && b.bottom > boxes[0].top);
      });
      expect(oneLine, (await figure.textContent()) ?? "").toBe(true);
    }
  });
});
