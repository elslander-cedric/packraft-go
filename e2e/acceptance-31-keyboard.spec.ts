// Acceptance tests for #31 (ADR 0020), rewritten for the one planner (ADR 0034). Keyboard
// alone: after drawing on the map (out of scope), every control is reached with Tab and used
// with arrows, Enter/Space and Escape; no element.focus() or mouse on the controls themselves.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { expectInitialFocus } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";
import { freeMapCentre, legRows, openPlanner, points as pointMarkers } from "./support/planner";

const text = strings.phone;
const rows = legRows;
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const menuItem = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const dialog = (page: Page) => page.getByRole("alertdialog");
const settingsDialog = (page: Page) => page.getByRole("dialog", { name: strings.settingsPanelLabel });
const modeGroup = (page: Page) => page.getByRole("group", { name: text.nextLegModeLabel });
const modeButton = (page: Page, mode: string) => modeGroup(page).getByRole("button", { name: mode });
const paceField = (page: Page) => settingsDialog(page).getByLabel(strings.paceFactorLabel);
const legTime = (page: Page, leg: number) => rows(page).nth(leg).locator(".phone-row-time");
const storedSettings = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
const storedName = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.trip.name ?? null, TRIP_KEY);
const isFocused = (l: Locator) => l.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));

async function openMap(page: Page) {
  await openPlanner(page);
  const centre = await freeMapCentre(page);
  return (dx: number, dy: number) => page.mouse.click(centre.x + dx, centre.y + dy);
}

/** Starts keyboard use from the page itself, as after a click on an empty spot. */
async function startFromPage(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Presses Tab until `target` (or something inside it) has focus. */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await isFocused(target)) return i + 1;
  }
  throw new Error(`Tab never reached ${target}`);
}

/** Tabs to the menu button, opens it with `key` and arrows down to `item`, leaving it focused. */
async function arrowToMenuItem(page: Page, item: string, key = "Enter") {
  await tabTo(page, button(page, text.menu.button));
  await page.keyboard.press(key);
  await expect(menuItem(page, text.menu.newTrip)).toBeFocused();
  for (let i = 0; i < 8 && !(await isFocused(menuItem(page, item))); i++) await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, item)).toBeFocused();
}

async function drawLeg(page: Page) {
  const click = await openMap(page);
  await click(-100, 0);
  await click(100, 0);
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(1);
}

test.describe("#31: confirmations by keyboard alone", () => {
  test("New trip: the menu by Tab + Enter opens the dialog, focus is trapped inside, Escape cancels, confirm clears; focus returns to the menu button each time", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    await drawLeg(page);
    await startFromPage(page);
    const menu = button(page, text.menu.button);

    // Enter on New trip opens it; the approved wording is shown (title + message).
    await arrowToMenuItem(page, text.menu.newTrip);
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Start a new trip?");
    await expect(dialog(page)).toContainText("Your current trip will be lost.");
    // Focus starts on the safe answer and stays inside the dialog.
    const cancel = dialog(page).getByRole("button", { name: strings.confirmCancel });
    const confirm = dialog(page).getByRole("button", { name: strings.newTripConfirm.confirm });
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog(page).locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Shift+Tab");
    await expect(dialog(page).locator(":focus")).toHaveCount(1);

    // Escape cancels: nothing changes, focus is back on the menu button.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(menu).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);

    // Space opens the menu again; Enter on the focused Cancel cancels.
    await page.keyboard.press("Space");
    await expect(menuItem(page, text.menu.newTrip)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect(menu).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);

    // Confirm by keyboard clears the trip.
    await page.keyboard.press("Enter");
    await expect(menuItem(page, text.menu.newTrip)).toBeFocused();
    await page.keyboard.press("Enter");
    await expectInitialFocus(page);
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(menu).toBeFocused();

    // Now empty: New trip asks nothing.
    await page.keyboard.press("Enter");
    await expect(menuItem(page, text.menu.newTrip)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(dialog(page)).toHaveCount(0);
    expect(native).toEqual([]);
  });

  test("Open trip: arrows to Open trip, Enter, choose a file; Escape keeps the trip, Space-confirm replaces it; focus returns to the menu button", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    await drawLeg(page);
    await startFromPage(page);

    // A saved trip to open: the current one, unnamed, saved by keyboard.
    await arrowToMenuItem(page, text.menu.saveFile);
    await page.keyboard.press("Enter");
    const nameField = page.getByRole("dialog").getByRole("textbox", { name: strings.tripNameLabel });
    await expect(nameField).toBeFocused();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    const saved = (await download.path())!;

    // Rename the current trip by keyboard, so the open can be told apart.
    await arrowToMenuItem(page, text.menu.tripDetails);
    await page.keyboard.press("Enter");
    const detailsName = page.getByRole("dialog").getByRole("textbox", { name: strings.tripNameLabel });
    await expect(detailsName).toBeFocused();
    await page.keyboard.type("Current");
    await page.keyboard.press("Enter");
    await expect.poll(() => storedName(page)).toBe("Current");
    const menu = button(page, text.menu.button);

    const choose = async () => {
      await arrowToMenuItem(page, text.menu.openFile);
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
      await chooser.setFiles(saved);
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toContainText(strings.openFileConfirm.title);
      await expect(dialog(page)).toContainText(strings.openFileConfirm.message);
      await expectInitialFocus(page);
    };

    await choose();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(menu).toBeFocused();
    expect(await storedName(page)).toBe("Current");

    await choose();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: strings.openFileConfirm.confirm })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => storedName(page)).toBe("");
    await expect(pointMarkers(page)).toHaveCount(2);
    await expect(menu).toBeFocused();
    expect(native).toEqual([]);
  });

  test("New trip shows one dialog, and Ctrl+Z while it is open does not undo", async ({ page }) => {
    await serveOffline(page);
    await drawLeg(page);
    await startFromPage(page);
    await arrowToMenuItem(page, text.menu.newTrip);
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(1);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(pointMarkers(page)).toHaveCount(2);
  });
});

test.describe("#31: controls by keyboard alone", () => {
  test("hike/paddle: Tab reaches the next leg's mode, arrows + Space switch to paddle, pressing it again keeps it; the next leg is a paddle leg and Ctrl+Z removes it", async ({
    page,
  }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-150, 0);
    await click(0, 0);
    await expect(rows(page)).toHaveCount(1);
    await startFromPage(page);
    await tabTo(page, modeGroup(page));
    const hike = modeButton(page, strings.legModeHike);
    const paddle = modeButton(page, strings.legModePaddle);
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    if (!(await isFocused(paddle))) await page.keyboard.press("ArrowRight");
    await expect(paddle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(paddle).toHaveAttribute("aria-pressed", "true");
    await expect(hike).toHaveAttribute("aria-pressed", "false");

    // Pressing the current mode keeps exactly one option pressed.
    await page.keyboard.press("Space");
    await expect(paddle).toHaveAttribute("aria-pressed", "true");
    await expect(hike).toHaveAttribute("aria-pressed", "false");

    // The next leg drawn is a paddle leg.
    await click(150, 0);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(1)).toHaveClass(/phone-row-paddle/);
    await expect(rows(page).nth(0)).toHaveClass(/phone-row-hike/);

    // Undo works from the keyboard and removes it.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(rows(page)).toHaveCount(1);
    await expect(pointMarkers(page)).toHaveCount(2);
  });

  test("pace factor: Tab, arrows step; invalid (-2, 0, empty) is marked and can't be saved; a valid value is used and remembered", async ({
    page,
  }) => {
    await serveOffline(page);
    await drawLeg(page);
    await startFromPage(page);
    const base = (await legTime(page, 0).textContent())!;
    await arrowToMenuItem(page, text.menu.settings);
    await page.keyboard.press("Enter");
    await expect(paceField(page)).toBeFocused();
    const save = settingsDialog(page).getByRole("button", { name: text.menu.settingsConfirm });

    await page.keyboard.press("ArrowUp");
    await expect(paceField(page)).toHaveValue("1.1");
    await page.keyboard.press("ArrowDown");
    await expect(paceField(page)).toHaveValue("1");

    for (const bad of ["-2", "0", ""]) {
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      if (bad) await page.keyboard.type(bad);
      await expect(paceField(page)).toHaveAttribute("aria-invalid", "true");
      await expect(save).toBeDisabled();
    }
    // Tabbing away does not clamp or store the invalid value; Enter doesn't save it.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("-2");
    await page.keyboard.press("Tab");
    await expect(paceField(page)).toHaveValue("-2");
    await expect(paceField(page)).toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Shift+Tab");
    await expect(paceField(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(settingsDialog(page)).toBeVisible();
    expect((await storedSettings(page)) ?? "").not.toContain("-2");

    // Escape drops the draft; a valid value saved with Enter is used and remembered.
    await page.keyboard.press("Escape");
    await expect(settingsDialog(page)).toHaveCount(0);
    await expect(legTime(page, 0)).toHaveText(base);
    await expect(button(page, text.menu.button)).toBeFocused();
    await page.keyboard.press("Enter");
    for (let i = 0; i < 8 && !(await isFocused(menuItem(page, text.menu.settings))); i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(paceField(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("1.5");
    await expect(paceField(page)).toHaveAttribute("aria-invalid", "false");
    await page.keyboard.press("Enter");
    await expect(settingsDialog(page)).toHaveCount(0);
    await expect(legTime(page, 0)).not.toHaveText(base);
    await expect.poll(() => storedSettings(page)).toContain('"paceFactor":1.5');
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
    await expect(legTime(page, 0)).not.toHaveText(base);
    await arrowToMenuItem(page, text.menu.settings);
    await page.keyboard.press("Enter");
    await expect(paceField(page)).toHaveValue("1.5");
  });

  test("disabled controls are reachable by Tab and arrows, say why, and do nothing on Enter/Space", async ({ page }) => {
    await serveOffline(page);
    await openMap(page);
    await startFromPage(page);
    const undo = button(page, strings.undoButton);
    await tabTo(page, undo);
    await expect(undo).toBeDisabled();
    await expect(undo).toHaveAccessibleDescription(strings.undoDisabledReason);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(pointMarkers(page)).toHaveCount(0);

    // Route back to the start isn't offered before there are two points.
    await expect(button(page, text.backToStartButton)).toHaveCount(0);

    // Export GPX in the menu, reached with the arrows: disabled, and Enter does nothing.
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await arrowToMenuItem(page, text.menu.exportGpx);
    await expect(menuItem(page, text.menu.exportGpx)).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await expect(page.getByRole("dialog", { name: text.menu.exportTitle })).toHaveCount(0);
    expect(downloaded).toBe(false);
  });
});
