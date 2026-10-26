// Your access points in the phone planner (#119, ADR 0026; first #63, ADR 0023): the
// Access points tab, the floating button bottom left, place mode without a fix, and
// everything saved on the device at once, with or without signal. Dragging a marker is
// checked in phone-point-editing.spec.ts (#120).
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { strings } from "../src/ui/strings";
import { confirmDialog } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.accessPoints;
const phoneText = strings.phone;

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const routePoints = (page: Page) => mapRegion(page).locator("path.point");
const sheet = (page: Page) => page.getByRole("dialog", { name: phoneText.sheetLabel });
const accessTab = (page: Page) => sheet(page).getByRole("tab", { name: phoneText.tabs.accessPoints });
const section = (page: Page) =>
  sheet(page).getByRole("region", {
    name: phoneText.accessPointsLabel,
    exact: true,
  });
const details = (page: Page) => sheet(page).getByRole("region", { name: text.detailsLabel, exact: true });
const markHere = (page: Page) => section(page).getByRole("button", { name: phoneText.markHereButton });
const markButton = (page: Page) => page.getByRole("button", { name: phoneText.markAccessPointButton });
const rows = (page: Page) => section(page).getByRole("list").getByRole("listitem");
const placingLine = (page: Page) => page.getByRole("status").filter({ hasText: phoneText.placingState });
const cancelPlacing = (page: Page) => page.getByRole("button", { name: phoneText.placingCancel });
const savedNote = (page: Page) => section(page).getByRole("status").filter({ hasText: phoneText.savedOnDevice });
const toggle = (page: Page, group: string, option: string) =>
  details(page).getByRole("group", { name: group }).getByRole("button", { name: option });

const AT_HOTTON = { latitude: 50.268, longitude: 5.446 };

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), ACCESS_POINTS_KEY);

const saved = (id: string, lat: number, lng: number, note: string): AccessPoint => ({
  id,
  position: { lat, lng },
  use: "put-in",
  kind: "slipway",
  note,
  checkedOnSite: null,
  createdAt: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
});

/** Stores access points on the device before the planner opens. */
async function storePoints(page: Page, points: AccessPoint[]) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [ACCESS_POINTS_KEY, serialiseAccessPoints(points)],
  );
}

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** How much of the screen the sheet covers, in pixels. */
async function sheetHeight(page: Page) {
  const box = (await sheet(page).boundingBox())!;
  return page.viewportSize()!.height - box.y;
}

/** The sheet's height once it has stopped moving (it slides between stops). */
async function settledSheetHeight(page: Page) {
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = await sheetHeight(page);
        const settled = Math.abs(now - last) < 1;
        last = now;
        return settled;
      },
      { intervals: [100] },
    )
    .toBe(true);
  return last;
}

/** Makes the browser answer every position request with "permission denied". */
async function denyLocation(page: Page) {
  // Chromium answers without asking when the permission was never granted; make the denial explicit.
  await page.evaluate(() => {
    const denied = {
      code: 1,
      message: "denied",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    navigator.geolocation.watchPosition = (_success, failure) => {
      failure?.(denied as GeolocationPositionError);
      return 0;
    };
  });
}

test("Mark here in the Access points tab marks one at my GPS position, saved at once, selected, nothing pops up", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 12 });
  await serveOffline(page);
  await openPhone(page);

  await accessTab(page).click();
  await expect(section(page)).toContainText(phoneText.noAccessPoints);
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(page.viewportSize()!.height * 0.45);
  const half = await settledSheetHeight(page);
  await markHere(page).click();

  // Saved at once with the default use and kind, shown selected, and nothing pops up.
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/access-point-selected/);
  await expect(details(page)).toBeVisible();
  await expect(details(page)).not.toContainText(text.moveHint);
  await expect(section(page)).toContainText(phoneText.markedAccuracy("12 m"));
  await expect(savedNote(page)).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(Math.abs((await settledSheetHeight(page)) - half)).toBeLessThan(2);
  const [point] = (await stored(page)).accessPoints;
  expect(point).toMatchObject({ use: "both", kind: "informal-bank" });
  expect(point.position.lat).toBeCloseTo(AT_HOTTON.latitude, 4);
  expect(point.position.lng).toBeCloseTo(AT_HOTTON.longitude, 4);
  // No route point was added.
  await expect(routePoints(page)).toHaveCount(0);

  // Edit use, kind, note and the checked date.
  await toggle(page, text.useLabel, text.uses["put-in"]).click();
  await toggle(page, text.kindLabel, text.kinds.slipway).click();
  await details(page).getByLabel(text.noteLabel).fill("Slipway by the bridge");
  await details(page).getByRole("button", { name: text.checkedTodayButton }).click();
  await expect(details(page).getByLabel(text.checkedOnSiteLabel)).not.toHaveValue("");
  await expect.poll(async () => (await stored(page)).accessPoints[0].note).toBe("Slipway by the bridge");
  const edited = (await stored(page)).accessPoints[0];
  expect(edited).toMatchObject({ use: "put-in", kind: "slipway" });
  expect(edited.checkedOnSite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // Large tap targets (at least 44 px).
  expect((await markHere(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await markButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await toggle(page, text.kindLabel, text.kinds.jetty).boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // It survives a reload, and shows on the desktop too.
  await page.reload();
  await expect(markers(page)).toHaveCount(1);
  await accessTab(page).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(phoneText.listEntry(text.uses["put-in"], text.kinds.slipway));
  await expect(rows(page).first()).toContainText("Slipway by the bridge");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByRole("complementary", { name: text.panelLabel })).toContainText(text.count(1));
});

test("the floating button marks one at my GPS position from the peek, and the sheet stays where it is", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 10 });
  await serveOffline(page);
  await openPhone(page);

  const peek = await settledSheetHeight(page);
  // Bottom left, over the map.
  const button = (await markButton(page).boundingBox())!;
  expect(button.x).toBeLessThan(page.viewportSize()!.width / 2);
  expect(button.y + button.height).toBeLessThanOrEqual(page.viewportSize()!.height - peek);

  await markButton(page).click();
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/access-point-selected/);
  await expect.poll(async () => (await stored(page))?.accessPoints.length).toBe(1);
  expect(Math.abs((await settledSheetHeight(page)) - peek)).toBeLessThan(2);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(routePoints(page)).toHaveCount(0);
});

test("with the network blocked, marking, editing and deleting keep working and are saved on the device", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 10 });
  const network = await serveOffline(page);
  await openPhone(page);
  await accessTab(page).click();

  await context.setOffline(true);
  await markButton(page).click();
  await expect(markers(page)).toHaveCount(1);
  await markHere(page).click();
  await expect(markers(page)).toHaveCount(2);
  await expect(savedNote(page)).toBeVisible();
  await expect.poll(async () => (await stored(page)).accessPoints.length).toBe(2);

  // Done closes the details; the row opens them again to edit.
  await details(page).getByRole("button", { name: text.closeButton }).click();
  await expect(details(page)).toHaveCount(0);
  await rows(page).first().getByRole("button").click();
  await toggle(page, text.useLabel, text.uses["take-out"]).click();
  await expect(rows(page).first()).toContainText(text.uses["take-out"]);
  await expect.poll(async () => (await stored(page)).accessPoints[0].use).toBe("take-out");

  // Delete it, after confirming (Cancel keeps it).
  await details(page).getByRole("button", { name: text.deleteButton }).click();
  await expect(confirmDialog(page)).toHaveAccessibleName(text.deleteConfirm.title);
  await confirmDialog(page).getByRole("button", { name: strings.confirmCancel }).click();
  await expect(rows(page)).toHaveCount(2);
  await details(page).getByRole("button", { name: text.deleteButton }).click();
  await confirmDialog(page).getByRole("button", { name: text.deleteConfirm.confirm }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(markers(page)).toHaveCount(1);
  await expect(details(page)).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).accessPoints.length).toBe(1);
  expect((await stored(page)).accessPoints[0].use).toBe("both");

  await context.setOffline(false);
  await page.reload();
  await expect(markers(page)).toHaveCount(1);
  expect(network.blocked).toEqual([]);
});

test("without a fix the button enters place mode; Cancel leaves it; the next tap places an access point, not a route point", async ({
  page,
}) => {
  await serveOffline(page);
  await openPhone(page);
  await denyLocation(page);
  const box = (await mapRegion(page).boundingBox())!;
  const tapMap = (dx: number) => page.touchscreen.tap(box.x + box.width / 2 + dx, box.y + box.height / 3);

  await markButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: phoneText.positionDenied })).toBeVisible();
  await expect(placingLine(page)).toBeVisible();
  await expect(markers(page)).toHaveCount(0);

  // Cancel: the next tap adds a route point again.
  await cancelPlacing(page).click();
  await expect(placingLine(page)).toHaveCount(0);
  await tapMap(-80);
  await expect(routePoints(page)).toHaveCount(1);
  await expect(markers(page)).toHaveCount(0);

  // Place mode again: the tap places an access point and adds no route point.
  await markButton(page).click();
  await expect(placingLine(page)).toBeVisible();
  await tapMap(80);
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/access-point-selected/);
  await expect(routePoints(page)).toHaveCount(1);
  await expect(placingLine(page)).toHaveCount(0);
  expect((await stored(page)).accessPoints).toHaveLength(1);
  // Its details are in the Access points tab, and it is saved on the device.
  await accessTab(page).click();
  await expect(details(page)).toBeVisible();
  await expect(savedNote(page)).toBeVisible();

  // Mark here in the tab does the same without a fix.
  await markHere(page).click();
  await expect(placingLine(page)).toBeVisible();
  await cancelPlacing(page).click();

  // The point placed by tapping survives a reload.
  await page.reload();
  await expect(markers(page)).toHaveCount(1);
});

test("while the floating button waits for a fix it says so over the map", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);
  // A position that never comes.
  await page.evaluate(() => {
    navigator.geolocation.watchPosition = () => 0;
  });

  await markButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: phoneText.markLocating })).toBeVisible();
  await expect(markButton(page)).toBeDisabled();
  await expect(markers(page)).toHaveCount(0);
});

test("tapping a row zooms the map to that access point and opens its details", async ({ page }) => {
  await storePoints(page, [saved("a", 50.268, 5.446, "Hotton bridge"), saved("b", 51.05, 3.72, "Ghent quay")]);
  const network = await serveOffline(page);
  await openPhone(page);
  await accessTab(page).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(details(page)).toHaveCount(0);

  await rows(page).nth(1).getByRole("button").click();
  await expect(details(page)).toBeVisible();
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Ghent quay");
  await expect(markers(page).nth(1)).toHaveClass(/access-point-selected/);

  // Zoomed in, with the marker on the part of the map above the sheet.
  await expect.poll(() => network.tiles.some((tile) => tile.z >= 15)).toBe(true);
  await expect
    .poll(async () => {
      const marker = (await markers(page).nth(1).boundingBox())!;
      const top = (await sheet(page).boundingBox())!.y;
      return marker.y > 0 && marker.y + marker.height < top;
    })
    .toBe(true);
});

test("tapping an access point's marker opens its details and raises the sheet to half", async ({ page }) => {
  await storePoints(page, [saved("a", 50.5, 4.47, "Meuse slipway")]);
  await serveOffline(page);
  await openPhone(page);
  expect(await settledSheetHeight(page)).toBeLessThan(200);

  const marker = (await markers(page).boundingBox())!;
  await page.touchscreen.tap(marker.x + marker.width / 2, marker.y + marker.height / 2);

  await expect(accessTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(details(page)).toBeVisible();
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Meuse slipway");
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(page.viewportSize()!.height * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(page.viewportSize()!.height * 0.55);
  await expect(routePoints(page)).toHaveCount(0);
});
