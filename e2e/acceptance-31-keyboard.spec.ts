// Acceptance tests for #31 (ADR 0020), written from the ticket before
// reading the diff. Keyboard alone: after drawing on the map (out of scope),
// every control is reached with Tab and used with arrows, Enter/Space and
// Escape; no element.focus() or mouse on the controls themselves.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { expectInitialFocus } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const settingsPanel = (page: Page) => page.getByRole("region", { name: strings.settingsPanelLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const dialog = (page: Page) => page.getByRole("alertdialog");
const modeGroup = (page: Page, leg: number) =>
  rows(page).nth(leg).getByRole("group", { name: strings.legModeLabel(leg + 1) });
const modeButton = (page: Page, leg: number, mode: string) => modeGroup(page, leg).getByRole("button", { name: mode });
const paceField = (page: Page) => settingsPanel(page).getByLabel(strings.paceFactorLabel);
const legTime = (page: Page, leg: number) => rows(page).nth(leg).locator(".leg-time");
const storedSettings = (page: Page) => page.evaluate(() => window.localStorage.getItem("packraft-go.settings"));
const isFocused = (l: Locator) => l.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** Starts keyboard use from the trip name field, as if the planner had just typed it. */
async function startAtTripName(page: Page) {
  await tripName(page).click();
  await expect(tripName(page)).toBeFocused();
}

/** Presses Tab until `target` (or something inside it) has focus. */
async function tabTo(page: Page, target: Locator, max = 25) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await isFocused(target)) return i + 1;
  }
  throw new Error(`Tab never reached ${target}`);
}

async function drawLeg(page: Page) {
  const click = await openMap(page);
  await click(-100, 0);
  await click(100, 0);
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(1);
}

test.describe("#31: confirmations by keyboard alone", () => {
  test("New trip: Tab + Enter opens the dialog, focus is trapped inside, Escape cancels, confirm clears; focus returns to New trip each time", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    await drawLeg(page);
    await startAtTripName(page);
    const newTrip = button(page, strings.newTripButton);
    await tabTo(page, newTrip);

    // Enter opens it; the approved wording is shown (title + message).
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

    // Escape cancels: nothing changes, focus is back on New trip.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(newTrip).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);

    // Space reopens; Enter on the focused Cancel cancels.
    await page.keyboard.press("Space");
    await expect(dialog(page)).toBeVisible();
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect(newTrip).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);

    // Confirm by keyboard clears the trip.
    await page.keyboard.press("Enter");
    await expectInitialFocus(page);
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(newTrip).toBeFocused();

    // Now empty: Enter on New trip asks nothing.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(dialog(page)).toHaveCount(0);
    expect(native).toEqual([]);
  });

  test("Open file: arrows to Open file, Enter, choose a file; Escape keeps the trip, Space-confirm replaces it; focus returns to Open file", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    await drawLeg(page);
    // A saved trip to open: the current one, renamed.
    const [download] = await Promise.all([page.waitForEvent("download"), button(page, strings.saveFileButton).click()]);
    const saved = (await download.path())!;
    await startAtTripName(page);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Current");
    const openFile = button(page, strings.openFileButton);
    // The toolbar is one Tab stop; it remembers the last button used (Save to file).
    await tabTo(page, page.getByRole("toolbar", { name: strings.tripToolbarLabel }));
    for (let i = 0; i < 4 && !(await isFocused(openFile)); i++) await page.keyboard.press("ArrowRight");
    await expect(openFile).toBeFocused();

    const choose = async () => {
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
    await expect(openFile).toBeFocused();
    await expect(tripName(page)).toHaveValue("Current");

    await choose();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: strings.openFileConfirm.confirm })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog(page)).toHaveCount(0);
    await expect(tripName(page)).toHaveValue("");
    await expect(pointMarkers(page)).toHaveCount(2);
    await expect(openFile).toBeFocused();
    expect(native).toEqual([]);
  });

  test("double-clicking New trip shows one dialog, and Ctrl+Z while it is open does not undo", async ({ page }) => {
    await serveOffline(page);
    await drawLeg(page);
    await button(page, strings.newTripButton).dblclick();
    await expect(dialog(page)).toHaveCount(1);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(pointMarkers(page)).toHaveCount(2);
  });
});

test.describe("#31: controls by keyboard alone", () => {
  test("hike/paddle: Tab reaches the leg's switch, arrows + Space switch to paddle, pressing it again keeps it, Ctrl+Z switches back", async ({
    page,
  }) => {
    await serveOffline(page);
    await drawLeg(page);
    await startAtTripName(page);
    await tabTo(page, modeGroup(page, 0));
    const hike = modeButton(page, 0, strings.legModeHike);
    const paddle = modeButton(page, 0, strings.legModePaddle);
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    if (!(await isFocused(paddle))) await page.keyboard.press("ArrowRight");
    await expect(paddle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(paddle).toHaveAttribute("aria-pressed", "true");
    await expect(hike).toHaveAttribute("aria-pressed", "false");
    await expect(rows(page).nth(0)).toHaveClass(/leg-row-paddle/);

    // Pressing the current mode keeps exactly one option pressed.
    await page.keyboard.press("Space");
    await expect(paddle).toHaveAttribute("aria-pressed", "true");
    await expect(hike).toHaveAttribute("aria-pressed", "false");

    // Undo works from the keyboard and restores hike.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page).nth(0)).toHaveClass(/leg-row-hike/);
    await expect(pointMarkers(page)).toHaveCount(2);
  });

  test("pace factor: Tab, arrows step; invalid (-2, 0, empty) is marked and ignored; a valid value is used and remembered", async ({
    page,
  }) => {
    await serveOffline(page);
    await drawLeg(page);
    await startAtTripName(page);
    await tabTo(page, paceField(page));
    const base = (await legTime(page, 0).textContent())!;

    await page.keyboard.press("ArrowUp");
    await expect(paceField(page)).toHaveValue("1.1");
    await expect(legTime(page, 0)).not.toHaveText(base);
    await page.keyboard.press("ArrowDown");
    await expect(paceField(page)).toHaveValue("1");
    await expect(legTime(page, 0)).toHaveText(base);

    for (const bad of ["-2", "0", ""]) {
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      if (bad) await page.keyboard.type(bad);
      await expect(paceField(page)).toHaveAttribute("aria-invalid", "true");
      await expect(legTime(page, 0)).toHaveText(base);
    }
    // Tabbing away does not clamp or store the invalid value.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("-2");
    await page.keyboard.press("Tab");
    await expect(paceField(page)).toHaveValue("-2");
    await expect(paceField(page)).toHaveAttribute("aria-invalid", "true");
    expect(await storedSettings(page) ?? "").not.toContain("-2");
    await expect(legTime(page, 0)).toHaveText(base);

    await page.keyboard.press("Shift+Tab");
    await expect(paceField(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("1.5");
    await expect(paceField(page)).toHaveAttribute("aria-invalid", "false");
    await expect(legTime(page, 0)).not.toHaveText(base);
    await expect.poll(() => storedSettings(page)).toContain('"paceFactor":1.5');
    await page.reload();
    await expect(paceField(page)).toHaveValue("1.5");
  });

  test("disabled toolbar buttons are reachable by Tab and arrows, say why, and do nothing on Enter/Space", async ({ page }) => {
    await serveOffline(page);
    await openMap(page);
    await startAtTripName(page);
    const undo = button(page, strings.undoButton);
    await tabTo(page, undo);
    await expect(undo).toBeDisabled();
    await expect(undo).toHaveAccessibleDescription(strings.undoDisabledReason);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(pointMarkers(page)).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.deletePointButton)).toBeFocused();
    await expect(button(page, strings.deletePointButton)).toHaveAccessibleDescription(strings.deletePointDisabledReason);
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.campButton)).toBeFocused();
    await expect(button(page, strings.campButton)).toHaveAccessibleDescription(strings.campDisabledReason);
    await expect(page.getByRole("tooltip")).toHaveText(strings.campDisabledReason);
    await page.keyboard.press("Enter");
    await expect(button(page, strings.campButton)).toHaveAttribute("aria-pressed", "false");

    // Export GPX in the trip toolbar, reached with Shift+Tab and arrows.
    await page.keyboard.press("Shift+Tab");
    const exportGpx = button(page, strings.exportGpxButton);
    for (let i = 0; i < 4 && !(await isFocused(exportGpx)); i++) await page.keyboard.press("ArrowRight");
    await expect(exportGpx).toBeFocused();
    await expect(exportGpx).toBeDisabled();
    await expect(exportGpx).toHaveAccessibleDescription(strings.exportGpxDisabledReason);
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(downloaded).toBe(false);
  });
});
