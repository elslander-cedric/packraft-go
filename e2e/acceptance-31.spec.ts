// Acceptance tests for #31: interface controls on Base UI (ADR 0020), on the one planner
// (ADR 0034). Confirmations are in-page Alert Dialogs; the next leg's hike/paddle toggle,
// the settings and the menu work by keyboard alone; a disabled Undo says why.
import { expect, test, type Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { confirmDialog, expectInitialFocus } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";
import {
  freeMapCentre,
  legLines,
  legRows as rows,
  menuButton,
  menuItem,
  openPlanner,
  points as pointMarkers,
  renameTrip,
  settingsDialog,
} from "./support/planner";

const text = strings.phone;
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const modeButton = (page: Page, mode: string) =>
  page.getByRole("group", { name: text.nextLegModeLabel }).getByRole("button", { name: mode });
const paceField = (page: Page) => settingsDialog(page).getByLabel(strings.paceFactorLabel);
const speedField = (page: Page) => settingsDialog(page).getByLabel(strings.paddleSpeedLabel);
const legTime = (page: Page, leg: number) => rows(page).nth(leg).locator(".phone-row-time");
const storedName = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.trip.name ?? null, TRIP_KEY);

async function openMap(page: Page) {
  await openPlanner(page);
  const centre = await freeMapCentre(page);
  return (dx: number, dy: number) => page.mouse.click(centre.x + dx, centre.y + dy);
}

async function chooseFile(page: Page, name: string, content: string) {
  await menuButton(page).click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("menuitem", { name: text.menu.openFile, exact: true }).click(),
  ]);
  await chooser.setFiles({ name, mimeType: "application/json", buffer: Buffer.from(content, "utf8") });
}

test.describe("confirmations are in-page Alert Dialogs", () => {
  test("New trip asks in the page: Escape and Cancel keep the trip, confirm clears it; focus returns to the menu button", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    const click = await openMap(page);
    await renameTrip(page, "Keep me");
    await click(-100, 0);
    await click(100, 0);
    await expect(pointMarkers(page)).toHaveCount(2);

    const dialog = confirmDialog(page);

    // Escape cancels.
    await menuItem(page, text.menu.newTrip);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(strings.newTripConfirm.title);
    await expect(dialog).toHaveAccessibleDescription(strings.newTripConfirm.message);
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);
    expect(await storedName(page)).toBe("Keep me");

    // Cancel keeps the trip.
    await menuItem(page, text.menu.newTrip);
    await dialog.getByRole("button", { name: strings.confirmCancel }).click();
    await expect(dialog).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);

    // Shortcuts don't reach the planner while the question is open. (The page
    // behind a modal dialog is hidden from the accessibility tree, so check after closing.)
    await menuItem(page, text.menu.newTrip);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(pointMarkers(page)).toHaveCount(2);

    // Confirm, by keyboard: replaces the trip.
    await menuItem(page, text.menu.newTrip);
    await expectInitialFocus(page);
    await dialog.getByRole("button", { name: strings.newTripConfirm.confirm }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect.poll(() => storedName(page)).toBe("");

    // A trip without points is replaced without asking.
    await renameTrip(page, "Only a name");
    await menuItem(page, text.menu.newTrip);
    await expect.poll(() => storedName(page)).toBe("");
    await expect(dialog).toHaveCount(0);
    expect(native).toEqual([]);
  });

  test("Open trip over a trip with points asks in the page; Escape keeps it, confirm replaces it; focus returns to the menu button", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    const click = await openMap(page);
    await click(-150, 0);
    await click(150, 0);
    await expect(legLines(page)).toHaveCount(1);
    await menuItem(page, text.menu.saveFile);
    const nameDialog = page.getByRole("dialog", { name: text.menu.saveTitle });
    await nameDialog.getByLabel(strings.tripNameLabel).fill("From file");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      nameDialog.getByRole("button", { name: text.menu.saveConfirm }).click(),
    ]);
    const { readFile } = await import("node:fs/promises");
    const saved = await readFile((await download.path())!, "utf8");

    // Replace it with a different trip that has a point.
    await menuItem(page, text.menu.newTrip);
    await confirmDialog(page).getByRole("button", { name: strings.newTripConfirm.confirm }).click();
    await renameTrip(page, "Current");
    await click(0, 100);
    await expect(pointMarkers(page)).toHaveCount(1);

    const dialog = confirmDialog(page);
    await chooseFile(page, "trip.packraft.json", saved);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(strings.openFileConfirm.title);
    await expect(dialog).toHaveAccessibleDescription(strings.openFileConfirm.message);
    await expectInitialFocus(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
    expect(await storedName(page)).toBe("Current");
    await expect(pointMarkers(page)).toHaveCount(1);

    await chooseFile(page, "trip.packraft.json", saved);
    await expectInitialFocus(page);
    await dialog.getByRole("button", { name: strings.openFileConfirm.confirm }).click();
    await expect(dialog).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
    await expect.poll(() => storedName(page)).toBe("From file");
    await expect(pointMarkers(page)).toHaveCount(2);
    expect(native).toEqual([]);
  });
});

test.describe("keyboard alone", () => {
  test("next leg's hike/paddle Toggle Group: arrows move between Hike and Paddle, Space and Enter pick; the next leg follows", async ({
    page,
  }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-200, 0);

    const hike = modeButton(page, strings.legModeHike);
    const paddle = modeButton(page, strings.legModePaddle);
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    await hike.focus();
    await page.keyboard.press("ArrowRight");
    await expect(paddle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(paddle).toHaveAttribute("aria-pressed", "true");
    await expect(hike).toHaveAttribute("aria-pressed", "false");

    await page.keyboard.press("ArrowLeft");
    await expect(hike).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(hike).toHaveAttribute("aria-pressed", "true");

    // Pressing the current mode again keeps it.
    await page.keyboard.press("Enter");
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    await expect(paddle).toHaveAttribute("aria-pressed", "false");

    // Each leg is drawn with the mode picked for it.
    await click(-50, 0);
    await expect(rows(page).nth(0)).toHaveClass(/phone-row-hike/);
    await paddle.focus();
    await page.keyboard.press("Space");
    await click(100, 0);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(1)).toHaveClass(/phone-row-paddle/);
  });

  test("settings Number Fields: arrow keys step the value and typing replaces it; Save stores it and times follow", async ({
    page,
  }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-100, 0);
    await click(100, 0);
    await expect(rows(page)).toHaveCount(1);
    const before = (await legTime(page, 0).textContent())!;

    await menuItem(page, text.menu.settings);
    await paceField(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(paceField(page)).toHaveValue("1.1");
    await page.keyboard.press("ArrowDown");
    await expect(paceField(page)).toHaveValue("1");
    await page.keyboard.press("ArrowUp");

    await speedField(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(speedField(page)).toHaveValue("5.5");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("4");
    await expect(speedField(page)).toHaveValue("4");
    await settingsDialog(page).getByRole("button", { name: text.menu.settingsConfirm }).click();
    await expect(settingsDialog(page)).toHaveCount(0);

    await expect(legTime(page, 0)).not.toHaveText(before);
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY);
    expect(stored).toContain('"paddleSpeedKmh":4');
    expect(stored).toContain('"paceFactor":1.1');
  });

  test("the menu: arrows move between its items, Enter and Space pick; the floating Undo works with Space", async ({
    page,
  }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-100, 0);
    await click(100, 0);
    await expect(rows(page)).toHaveCount(1);

    await menuButton(page).focus();
    await page.keyboard.press("Enter");
    const item = (name: string) => page.getByRole("menuitem", { name, exact: true });
    await expect(item(text.menu.newTrip)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(text.menu.tripDetails)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(text.menu.saveFile)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(text.menu.openFile)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(text.menu.exportGpx)).toBeFocused();
    await page.keyboard.press("Space");
    const exportDialog = page.getByRole("dialog", { name: text.menu.exportTitle });
    await expect(exportDialog.getByLabel(strings.tripNameLabel)).toBeFocused();
    const [gpx] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    // Updated: ADR 0021 (#41). Export GPX downloads a ZIP of GPX files.
    expect(gpx.suggestedFilename()).toMatch(/\.zip$/);
    await expect(exportDialog).toHaveCount(0);

    const undo = button(page, strings.undoButton);
    await undo.focus();
    await page.keyboard.press("Space");
    await expect(pointMarkers(page)).toHaveCount(1);
  });
});

test.describe("disabled controls say why", () => {
  test("Undo exposes its reason as its accessible description while disabled; Export GPX is a disabled menu item", async ({
    page,
  }) => {
    await serveOffline(page);
    const click = await openMap(page);

    const undo = button(page, strings.undoButton);
    await expect(undo).toBeDisabled();
    await expect(undo).toHaveAccessibleDescription(strings.undoDisabledReason);
    // Keyboard users reach the disabled button too.
    await undo.focus();
    await expect(undo).toBeFocused();
    await menuButton(page).click();
    await expect(page.getByRole("menuitem", { name: text.menu.exportGpx })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    // Once enabled, the reason is gone.
    await click(-100, 0);
    await click(100, 0);
    await expect(undo).toBeEnabled();
    await expect(undo).not.toHaveAccessibleDescription(strings.undoDisabledReason);
    await menuButton(page).click();
    await expect(page.getByRole("menuitem", { name: text.menu.exportGpx })).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    // A disabled button does nothing when clicked: undo everything, then click Undo again.
    await undo.click();
    await undo.click();
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(undo).toBeDisabled();
    await undo.click({ force: true });
    await expect(pointMarkers(page)).toHaveCount(0);
  });
});
