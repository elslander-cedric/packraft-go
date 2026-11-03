// Access point editing, entered and left (ADR 0036, #225): the planner opens in normal mode
// with the Sections and Days tabs only; the floating button enters the mode, which shows only
// the Access points tab and the mark button; Done restores the earlier tab and panel or sheet.
// Entering and leaving clear the selection. On a wide screen and on a phone.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import {
  doneButton,
  editAccessPointsButton,
  editingBanner,
  enterAccessPointEditing,
  leaveAccessPointEditing,
  markAccessPointButton,
} from "./support/accessPointEditing";
import { serveOffline } from "./support/offline";
import {
  accessPointDialog,
  freeMapCentre,
  mapClicker,
  markAccessPointAt,
  openPlanner,
  points,
  saveAccessPoint,
  tripPanel,
} from "./support/planner";

const text = strings.planner;
const ACCESS_POINTS_KEY = "packraft-go.access-points";

const tabNames = (page: Page) => page.getByRole("tab");
const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const deletePoint = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });
const accessRows = (page: Page) =>
  page.getByRole("region", { name: text.accessPointsLabel, exact: true }).getByRole("listitem");
const markers = (page: Page) => page.locator(".leaflet-container .access-point-marker");
const storedPoints = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.accessPoints?.length ?? 0, ACCESS_POINTS_KEY);
const planner = (page: Page) => page.locator(".planner");

async function expectNormalMode(page: Page) {
  await expect(editAccessPointsButton(page)).toBeVisible();
  await expect(editingBanner(page)).toHaveCount(0);
  await expect(markAccessPointButton(page)).toHaveCount(0);
  await expect(tabNames(page)).toHaveText([text.tabs.sections, text.tabs.days]);
}

async function expectAtLeast44(page: Page) {
  for (const button of [editAccessPointsButton(page)]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("opens in normal mode, also after a reload made while editing access points", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    await expectNormalMode(page);
    await expectAtLeast44(page);

    await enterAccessPointEditing(page);
    await expect(tabNames(page)).toHaveText([text.tabs.accessPoints]);
    await expect(markAccessPointButton(page)).toBeVisible();
    await expect(editAccessPointsButton(page)).toHaveCount(0);
    const done = (await doneButton(page).boundingBox())!;
    expect(done.width).toBeGreaterThanOrEqual(44);
    expect(done.height).toBeGreaterThanOrEqual(44);

    await page.reload();
    await expect(tripPanel(page)).toBeVisible();
    await expectNormalMode(page);
  });

  test("entering opens the Access points tab from a collapsed panel; Done restores the tab and the collapsed panel", async ({
    page,
  }) => {
    await serveOffline(page);
    await openPlanner(page);
    await tab(page, text.tabs.days).click();
    await tripPanel(page).getByRole("button", { name: text.collapsePanelButton }).click();
    await expect(planner(page)).toHaveClass(/planner-panel-collapsed/);

    await enterAccessPointEditing(page);
    await expect(planner(page)).toHaveClass(/planner-panel-open/);
    await expect(accessRows(page).or(page.getByText(text.noAccessPoints))).not.toHaveCount(0);

    await leaveAccessPointEditing(page);
    await expect(planner(page)).toHaveClass(/planner-panel-collapsed/);
    await tripPanel(page).getByRole("button", { name: text.expandPanelButton }).click();
    await expect(tab(page, text.tabs.days)).toHaveAttribute("aria-selected", "true");
  });

  test("entering and leaving clear the selection", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    const click = await mapClicker(page);
    await click(0, 0);
    await click(-150, 80);
    await expect(points(page)).toHaveCount(2);
    // A selected route point is cleared by entering.
    const first = (await points(page).first().boundingBox())!;
    await page.waitForTimeout(450); // not a double tap
    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
    await expect(deletePoint(page)).toBeVisible();
    // No "make the selected route point an access point" in normal mode.
    await expect(page.getByRole("button", { name: text.markAccessPointButton })).toHaveCount(0);
    await enterAccessPointEditing(page);
    await expect(deletePoint(page)).toHaveCount(0);

    // An access point selected while editing is cleared by Done.
    const free = await freeMapCentre(page);
    await markAccessPointAt(page, { x: free.x + 150, y: free.y - 120 });
    await saveAccessPoint(page);
    await expect(markers(page)).toHaveClass(/access-point-selected/);
    await leaveAccessPointEditing(page);
    await expect(markers(page)).not.toHaveClass(/access-point-selected/);
  });

  test("marking works in access point editing by tapping the map without a fix", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    await enterAccessPointEditing(page);
    await markAccessPointButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: text.placingState })).toBeVisible();
    await page.mouse.click(400, 300);
    await expect(accessPointDialog(page)).toBeVisible();
    await saveAccessPoint(page);
    await expect(markers(page)).toHaveCount(1);
    await expect(points(page)).toHaveCount(0);
    await expect.poll(() => storedPoints(page)).toBe(1);
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("normal mode has Sections and Days; entering raises the sheet on Access points, Done restores the peek and the tab", async ({
    page,
  }) => {
    await serveOffline(page);
    await openPlanner(page);
    await expectNormalMode(page);
    await expectAtLeast44(page);
    await tab(page, text.tabs.days).click();
    // A tab press raises the sheet from the peek: put it back.
    await page.getByRole("slider", { name: text.resizeSheetHandle }).focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Home");
    await expect(planner(page)).toHaveClass(/planner-stop-peek/);

    await enterAccessPointEditing(page);
    await expect(planner(page)).not.toHaveClass(/planner-stop-peek/);
    await expect(tabNames(page)).toHaveText([text.tabs.accessPoints]);

    await leaveAccessPointEditing(page);
    await expect(planner(page)).toHaveClass(/planner-stop-peek/);
    await expect(tab(page, text.tabs.days)).toHaveAttribute("aria-selected", "true");
    await expect(tabNames(page)).toHaveText([text.tabs.sections, text.tabs.days]);
  });

  test("marking works in access point editing at the GPS position", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 50.268, longitude: 5.446, accuracy: 10 });
    await serveOffline(page);
    await openPlanner(page);
    await expect(markAccessPointButton(page)).toHaveCount(0);
    await enterAccessPointEditing(page);
    await markAccessPointButton(page).click();
    await expect(accessPointDialog(page)).toBeVisible();
    await expect.poll(() => storedPoints(page)).toBe(1);
  });
});
