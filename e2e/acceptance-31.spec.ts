// Acceptance tests for #31: interface controls on Base UI (ADR 0020).
// Confirmations are in-page Alert Dialogs; the hike/paddle switch, settings
// and toolbars work by keyboard alone; disabled toolbar buttons say why.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { confirmDialog } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const settingsPanel = (page: Page) => page.getByRole("region", { name: strings.settingsPanelLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const tripToolbar = (page: Page) => page.getByRole("toolbar", { name: strings.tripToolbarLabel });
const editToolbar = (page: Page) => page.getByRole("toolbar", { name: strings.toolbarLabel });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const modeButton = (page: Page, leg: number, mode: string) =>
  rows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name: mode });
const paceField = (page: Page) => settingsPanel(page).getByLabel(strings.paceFactorLabel);
const speedField = (page: Page) => settingsPanel(page).getByLabel(strings.paddleSpeedLabel);
const legTime = (page: Page, leg: number) => rows(page).nth(leg).locator(".leg-time");

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

async function chooseFile(page: Page, name: string, text: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button(page, strings.openFileButton).click()]);
  await chooser.setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text, "utf8") });
}

test.describe("confirmations are in-page Alert Dialogs", () => {
  test("New trip asks in the page: Escape and Cancel keep the trip, confirm clears it; focus returns to New trip", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    const click = await openMap(page);
    await tripName(page).fill("Keep me");
    await click(-100, 0);
    await click(100, 0);
    await expect(pointMarkers(page)).toHaveCount(2);

    const newTrip = button(page, strings.newTripButton);
    const dialog = confirmDialog(page);

    // Escape cancels.
    await newTrip.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(strings.newTripConfirm.title);
    await expect(dialog).toHaveAccessibleDescription(strings.newTripConfirm.message);
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(newTrip).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);
    await expect(tripName(page)).toHaveValue("Keep me");

    // Cancel keeps the trip.
    await newTrip.click();
    await dialog.getByRole("button", { name: strings.confirmCancel }).click();
    await expect(dialog).toHaveCount(0);
    await expect(newTrip).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);

    // Shortcuts don't reach the planner while the question is open.
    await newTrip.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(pointMarkers(page)).toHaveCount(2);

    // Confirm, by keyboard: replaces the trip.
    await dialog.getByRole("button", { name: strings.newTripConfirm.confirm }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(newTrip).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(tripName(page)).toHaveValue("");

    // A trip without points is replaced without asking.
    await tripName(page).fill("Only a name");
    await newTrip.click();
    await expect(tripName(page)).toHaveValue("");
    await expect(dialog).toHaveCount(0);
    expect(native).toEqual([]);
  });

  test("Open file over a trip with points asks in the page; Escape keeps it, confirm replaces it; focus returns to Open file", async ({
    page,
  }) => {
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(d.message());
      void d.dismiss();
    });
    await serveOffline(page);
    const click = await openMap(page);
    await tripName(page).fill("From file");
    await click(-150, 0);
    await click(150, 0);
    await expect(legLines(page)).toHaveCount(1);
    const [download] = await Promise.all([page.waitForEvent("download"), button(page, strings.saveFileButton).click()]);
    const { readFile } = await import("node:fs/promises");
    const text = await readFile((await download.path())!, "utf8");

    // Replace it with a different trip that has a point.
    await button(page, strings.newTripButton).click();
    await confirmDialog(page).getByRole("button", { name: strings.newTripConfirm.confirm }).click();
    await tripName(page).fill("Current");
    await click(0, 100);
    await expect(pointMarkers(page)).toHaveCount(1);

    const openFile = button(page, strings.openFileButton);
    const dialog = confirmDialog(page);
    await chooseFile(page, "trip.packraft.json", text);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(strings.openFileConfirm.title);
    await expect(dialog).toHaveAccessibleDescription(strings.openFileConfirm.message);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(openFile).toBeFocused();
    await expect(tripName(page)).toHaveValue("Current");
    await expect(pointMarkers(page)).toHaveCount(1);

    await chooseFile(page, "trip.packraft.json", text);
    await dialog.getByRole("button", { name: strings.openFileConfirm.confirm }).click();
    await expect(dialog).toHaveCount(0);
    await expect(openFile).toBeFocused();
    await expect(tripName(page)).toHaveValue("From file");
    await expect(pointMarkers(page)).toHaveCount(2);
    expect(native).toEqual([]);
  });
});

test.describe("keyboard alone", () => {
  test("hike/paddle Toggle Group: arrows move between Hike and Paddle, Space and Enter switch the leg", async ({ page }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-100, 0);
    await click(100, 0);
    await expect(rows(page)).toHaveCount(1);

    const hike = modeButton(page, 0, strings.legModeHike);
    const paddle = modeButton(page, 0, strings.legModePaddle);
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    await hike.focus();
    await page.keyboard.press("ArrowRight");
    await expect(paddle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(paddle).toHaveAttribute("aria-pressed", "true");
    await expect(hike).toHaveAttribute("aria-pressed", "false");
    await expect(rows(page).nth(0)).toHaveClass(/leg-row-paddle/);

    await page.keyboard.press("ArrowLeft");
    await expect(hike).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page).nth(0)).toHaveClass(/leg-row-hike/);

    // Pressing the leg's current mode again keeps it.
    await page.keyboard.press("Enter");
    await expect(hike).toHaveAttribute("aria-pressed", "true");
    await expect(paddle).toHaveAttribute("aria-pressed", "false");
  });

  test("settings Number Fields: arrow keys step the value and typing replaces it; times follow", async ({ page }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-100, 0);
    await click(100, 0);
    await expect(rows(page)).toHaveCount(1);
    const before = await legTime(page, 0).textContent();

    await paceField(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(paceField(page)).toHaveValue("1.1");
    await expect(legTime(page, 0)).not.toHaveText(before!);
    await page.keyboard.press("ArrowDown");
    await expect(paceField(page)).toHaveValue("1");
    await expect(legTime(page, 0)).toHaveText(before!);

    await speedField(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(speedField(page)).toHaveValue("5.5");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("4");
    await expect(speedField(page)).toHaveValue("4");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("packraft-go.settings")))
      .toContain('"paddleSpeedKmh":4');
  });

  test("toolbars: one Tab stop each, arrows move between buttons, Enter and Space activate", async ({ page }) => {
    await serveOffline(page);
    const click = await openMap(page);
    await click(-100, 0);
    await click(100, 0);
    await expect(rows(page)).toHaveCount(1);

    const newTrip = button(page, strings.newTripButton);
    await newTrip.focus();
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.saveFileButton)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.exportGpxButton)).toBeFocused();
    const [gpx] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    expect(gpx.suggestedFilename()).toMatch(/\.gpx$/);
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.openFileButton)).toBeFocused();

    // Tab leaves the trip toolbar for the edit toolbar.
    await page.keyboard.press("Tab");
    await expect(editToolbar(page).locator(":focus")).toHaveCount(1);
    await expect(tripToolbar(page).locator(":focus")).toHaveCount(0);

    const undo = button(page, strings.undoButton);
    await undo.focus();
    await page.keyboard.press("Space");
    await expect(pointMarkers(page)).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.deletePointButton)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(button(page, strings.campButton)).toBeFocused();
  });
});

test.describe("disabled toolbar buttons say why", () => {
  test("Undo, Delete point, Camp and Export GPX expose their reason via Tooltip and accessible description", async ({
    page,
  }) => {
    await serveOffline(page);
    const click = await openMap(page);

    const cases = [
      [strings.undoButton, strings.undoDisabledReason],
      [strings.deletePointButton, strings.deletePointDisabledReason],
      [strings.campButton, strings.campDisabledReason],
      [strings.exportGpxButton, strings.exportGpxDisabledReason],
    ] as const;
    for (const [name, reason] of cases) {
      const b = button(page, name);
      await expect(b).toBeDisabled();
      await expect(b).toHaveAccessibleDescription(reason);
      await b.hover();
      await expect(page.getByRole("tooltip")).toHaveText(reason);
      await page.mouse.move(0, 0);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      // Keyboard users reach the disabled button and see the reason too.
      await b.focus();
      await expect(b).toBeFocused();
      await expect(page.getByRole("tooltip")).toHaveText(reason);
      await b.blur();
    }

    // Once enabled, the reason is gone.
    await click(-100, 0);
    await click(100, 0);
    await expect(button(page, strings.undoButton)).toBeEnabled();
    await expect(button(page, strings.exportGpxButton)).toBeEnabled();
    await expect(button(page, strings.undoButton)).not.toHaveAccessibleDescription(strings.undoDisabledReason);
    await expect(button(page, strings.exportGpxButton)).not.toHaveAccessibleDescription(
      strings.exportGpxDisabledReason,
    );
    // A disabled button does nothing when clicked.
    await expect(button(page, strings.deletePointButton)).toBeDisabled();
    await button(page, strings.deletePointButton).click({ force: true });
    await expect(pointMarkers(page)).toHaveCount(2);
  });
});
