// Phone dialogs and the on-screen keyboard (#163): every dialog sits in the visible area
// above the keyboard, and scrolls inside when it doesn't fit. Save trip opens with its
// field focused (keyboard up); the form dialogs open without the keyboard.
// Playwright can't open a real keyboard, so window.visualViewport is replaced by a fake
// whose height the test shrinks, as the keyboard does on a phone.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.planner;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const menuItem = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });

const POINT: AccessPoint = {
  id: "ap-1",
  position: { lat: 50.268, lng: 5.446 },
  name: "",
  nameSource: "to-look-up",
  use: "put-in",
  kind: "slipway",
  note: "By the bridge",
  checkedOnSite: null,
  createdAt: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [ACCESS_POINTS_KEY, serialiseAccessPoints([POINT])],
  );
  // A visualViewport the test can shrink: `__keyboard(px)` opens a keyboard that tall, as on a phone.
  await page.addInitScript(() => {
    const fake = new EventTarget();
    let keyboard = 0;
    const height = () => window.innerHeight - keyboard;
    Object.defineProperties(fake, {
      width: { get: () => window.innerWidth },
      height: { get: height },
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
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
});

const openKeyboard = (page: Page, px: number) =>
  page.evaluate((height) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(height), px);

/** The height left above the keyboard. */
const visibleHeight = (page: Page) => page.evaluate(() => window.visualViewport!.height);

/** Fails unless `element` lies fully inside the area above the keyboard. */
async function expectAboveKeyboard(page: Page, element: Locator) {
  const height = await visibleHeight(page);
  await expect
    .poll(async () => {
      const box = (await element.boundingBox())!;
      return box.y >= 0 && box.y + box.height <= height;
    })
    .toBe(true);
}

async function choose(page: Page, name: string) {
  await page.getByRole("button", { name: text.menu.button }).click();
  await menuItem(page, name).click();
}

test("Save trip opens with the keyboard and sits above it", async ({ page }) => {
  await choose(page, text.menu.saveFile);
  const save = dialog(page, text.menu.saveTitle);
  await expect(save.getByLabel(strings.tripNameLabel)).toBeFocused();

  await openKeyboard(page, 340);
  await expectAboveKeyboard(page, save);
  await expectAboveKeyboard(page, save.getByRole("button", { name: text.menu.saveConfirm }));
});

test("Edit trip opens without the keyboard; once a field is tapped it sits above the keyboard", async ({ page }) => {
  await choose(page, text.menu.tripDetails);
  const details = dialog(page, text.menu.tripDetailsTitle);
  const name = details.getByLabel(strings.tripNameLabel);
  await expect(details).toBeVisible();
  await expect(name).not.toBeFocused();

  await name.click();
  await openKeyboard(page, 340);
  await expectAboveKeyboard(page, details);
  await expectAboveKeyboard(page, details.getByRole("button", { name: text.menu.tripDetailsConfirm }));
});

test("the access point dialog sits above the keyboard, and scrolls inside when it doesn't fit", async ({ page }) => {
  await sheet(page).getByRole("tab", { name: text.tabs.accessPoints }).click();
  const section = sheet(page).getByRole("region", { name: text.accessPointsLabel, exact: true });
  // A row's own button comes first, then its edit button.
  await section.getByRole("list").getByRole("listitem").first().getByRole("button").nth(1).click();
  const details = dialog(page, text.accessPointDialogTitle);
  await expect(details).toBeVisible();
  await expect(details.locator("input, textarea").first()).not.toBeFocused();

  const note = details.getByRole("textbox").first();
  await note.click();
  await openKeyboard(page, 560);
  await expectAboveKeyboard(page, details);
  // Taller than what is left: the panel scrolls, the focused field stays in view, Save is reachable.
  expect(await details.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(note).toBeFocused();
  await expectAboveKeyboard(page, note);
  const save = details.getByRole("button", { name: text.accessPointSave });
  await save.scrollIntoViewIfNeeded();
  await expectAboveKeyboard(page, save);

  // The keyboard closes: back in the middle of the full screen.
  await openKeyboard(page, 0);
  await expectAboveKeyboard(page, details);
  expect(await details.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);
});
