// Your access points in the phone planner (#119, ADR 0026; first #63, ADR 0023): the
// Access points tab with its edit and delete buttons, the edit dialog, the floating
// button bottom left, place mode without a fix, and every Save stored on the device at
// once, with or without signal. Dragging a marker is
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
// Not through the map region, which the edit dialog hides from the accessibility tree while open.
const markers = (page: Page) => page.locator(".leaflet-container .access-point-marker");
const routePoints = (page: Page) => page.locator(".leaflet-container path.point");
const sheet = (page: Page) => page.getByRole("dialog", { name: phoneText.sheetLabel });
const accessTab = (page: Page) => sheet(page).getByRole("tab", { name: phoneText.tabs.accessPoints });
const section = (page: Page) =>
  sheet(page).getByRole("region", {
    name: phoneText.accessPointsLabel,
    exact: true,
  });
const details = (page: Page) => page.getByRole("dialog", { name: phoneText.accessPointDialogTitle });
const save = (page: Page) => details(page).getByRole("button", { name: phoneText.accessPointSave });
const cancel = (page: Page) => details(page).getByRole("button", { name: strings.confirmCancel });
const markButton = (page: Page) => page.getByRole("button", { name: phoneText.markAccessPointButton });
const rows = (page: Page) => section(page).getByRole("list").getByRole("listitem");
/** A row's own button, which shows the point on the map (its edit and delete buttons follow it). */
const rowButton = (page: Page, n: number) => rows(page).nth(n).getByRole("button").first();
const editButton = (page: Page, heading: string) =>
  section(page).getByRole("button", { name: phoneText.editAccessPoint(heading), exact: true });
const deleteButton = (page: Page, heading: string) =>
  section(page).getByRole("button", { name: phoneText.deleteAccessPoint(heading), exact: true });
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
  name: "",
  nameSource: "to-look-up",
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


test("the floating button marks one at my GPS position, saved at once, and opens its details; Save stores the edits, Cancel drops them", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 12 });
  await serveOffline(page);
  await openPhone(page);

  await accessTab(page).click();
  await expect(section(page)).toContainText(phoneText.noAccessPoints);
  // No Mark here in the tab: the floating button marks.
  await expect(section(page).getByRole("button")).toHaveCount(0);
  await markButton(page).click();

  // Saved at once with the default use and kind, shown selected, and its details open in the dialog.
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/access-point-selected/);
  await expect(details(page)).toBeVisible();
  await expect(details(page)).not.toContainText(text.moveHint);
  // No GPS accuracy anywhere.
  await expect(page.getByText(/accurate to about/)).toHaveCount(0);
  await expect(details(page).getByRole("button", { name: text.deleteButton })).toHaveCount(0);
  await expect.poll(async () => (await stored(page))?.accessPoints.length).toBe(1);
  const [point] = (await stored(page)).accessPoints;
  expect(point).toMatchObject({ use: "both", kind: "informal-bank" });
  expect(point.position.lat).toBeCloseTo(AT_HOTTON.latitude, 4);
  expect(point.position.lng).toBeCloseTo(AT_HOTTON.longitude, 4);
  // No route point was added.
  await expect(routePoints(page)).toHaveCount(0);
  expect((await toggle(page, text.kindLabel, text.kinds.jetty).boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // Edit use, kind, note and the checked date: nothing is stored until Save.
  await toggle(page, text.useLabel, text.uses["put-in"]).click();
  await toggle(page, text.kindLabel, text.kinds.slipway).click();
  await details(page).getByLabel(text.noteLabel).fill("Slipway by the bridge");
  await details(page).getByRole("button", { name: text.checkedTodayButton }).click();
  await expect(details(page).getByLabel(text.checkedOnSiteLabel)).not.toHaveValue("");
  expect((await stored(page)).accessPoints[0]).toMatchObject({ use: "both", note: "" });
  await save(page).click();
  await expect(details(page)).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).accessPoints[0].note).toBe("Slipway by the bridge");
  const edited = (await stored(page)).accessPoints[0];
  expect(edited).toMatchObject({ use: "put-in", kind: "slipway" });
  expect(edited.checkedOnSite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // Under the dialog: the Access points tab, with the new point's row selected.
  await expect(accessTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 0)).toHaveAttribute("aria-current", "true");
  await expect(savedNote(page)).toBeVisible();

  // The edit button opens the details again; Cancel drops the changes and keeps the point selected.
  await editButton(page, "Slipway by the bridge").click();
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Slipway by the bridge");
  await details(page).getByLabel(text.noteLabel).fill("Changed my mind");
  await cancel(page).click();
  await expect(details(page)).toHaveCount(0);
  await expect(rows(page).first()).toContainText("Slipway by the bridge");
  expect((await stored(page)).accessPoints[0].note).toBe("Slipway by the bridge");
  await expect(rowButton(page, 0)).toHaveAttribute("aria-current", "true");

  // Large tap targets (at least 44 px).
  for (const button of [
    markButton(page),
    editButton(page, "Slipway by the bridge"),
    deleteButton(page, "Slipway by the bridge"),
  ]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // It survives a reload, and shows on the desktop too.
  await page.reload();
  await expect(markers(page)).toHaveCount(1);
  await accessTab(page).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(text.useAndKind(text.uses["put-in"], text.kinds.slipway));
  await expect(rows(page).first()).toContainText("Slipway by the bridge");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByRole("complementary", { name: text.panelLabel })).toContainText(text.count(1));
});

test("from the peek, the floating button marks one, opens the Access points tab at half and its details over it", async ({
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
  await expect(details(page)).toBeVisible();
  await expect.poll(async () => (await stored(page))?.accessPoints.length).toBe(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(routePoints(page)).toHaveCount(0);

  // Cancel keeps the new point, with its defaults.
  await cancel(page).click();
  await expect(accessTab(page)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(page.viewportSize()!.height * 0.45);
  await expect(rows(page)).toHaveCount(1);
  await expect(rowButton(page, 0)).toHaveAttribute("aria-current", "true");
  expect((await stored(page)).accessPoints).toHaveLength(1);
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
  await details(page).getByLabel(text.noteLabel).fill("First");
  await save(page).click();
  await markButton(page).click();
  await details(page).getByLabel(text.noteLabel).fill("Second");
  await save(page).click();
  await expect(markers(page)).toHaveCount(2);
  await expect(savedNote(page)).toBeVisible();
  await expect.poll(async () => (await stored(page)).accessPoints.length).toBe(2);

  // The edit button opens the details to edit; Save stores them.
  await editButton(page, "First").click();
  await toggle(page, text.useLabel, text.uses["take-out"]).click();
  await save(page).click();
  await expect(rows(page).first()).toContainText(text.uses["take-out"]);
  await expect.poll(async () => (await stored(page)).accessPoints[0].use).toBe("take-out");

  // Delete it with its delete button, after confirming (Cancel keeps it).
  await deleteButton(page, "First").click();
  await expect(confirmDialog(page)).toHaveAccessibleName(text.deleteConfirm.title);
  await confirmDialog(page).getByRole("button", { name: strings.confirmCancel }).click();
  await expect(rows(page)).toHaveCount(2);
  await deleteButton(page, "First").click();
  await confirmDialog(page).getByRole("button", { name: text.deleteConfirm.confirm }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(markers(page)).toHaveCount(1);
  await expect.poll(async () => (await stored(page)).accessPoints.length).toBe(1);
  expect((await stored(page)).accessPoints[0]).toMatchObject({ note: "Second", use: "both" });

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

  // Place mode again: the tap places an access point, adds no route point, and opens its details.
  await markButton(page).click();
  await expect(placingLine(page)).toBeVisible();
  await tapMap(80);
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/access-point-selected/);
  await expect(details(page)).toBeVisible();
  await expect(routePoints(page)).toHaveCount(1);
  await expect(placingLine(page)).toHaveCount(0);
  expect((await stored(page)).accessPoints).toHaveLength(1);
  // Under the details, the Access points tab; the point is saved on the device.
  await cancel(page).click();
  await expect(accessTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(savedNote(page)).toBeVisible();

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


test("tapping a row zooms the map to that access point and selects it, without opening its details", async ({
  page,
}) => {
  await storePoints(page, [saved("a", 50.268, 5.446, "Hotton bridge"), saved("b", 51.05, 3.72, "Ghent quay")]);
  const network = await serveOffline(page);
  await openPhone(page);
  await accessTab(page).click();
  await expect(rows(page)).toHaveCount(2);

  await rowButton(page, 1).click();
  await expect(rowButton(page, 1)).toHaveAttribute("aria-current", "true");
  await expect(markers(page).nth(1)).toHaveClass(/access-point-selected/);
  await expect(details(page)).toHaveCount(0);

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

test("tapping an access point's marker selects its row in the Access points tab and raises the sheet to half", async ({
  page,
}) => {
  await storePoints(page, [saved("a", 50.5, 4.47, "Meuse slipway")]);
  await serveOffline(page);
  await openPhone(page);
  expect(await settledSheetHeight(page)).toBeLessThan(200);

  const marker = (await markers(page).boundingBox())!;
  await page.touchscreen.tap(marker.x + marker.width / 2, marker.y + marker.height / 2);

  await expect(accessTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(rowButton(page, 0)).toHaveAttribute("aria-current", "true");
  await expect(rowButton(page, 0)).toBeInViewport();
  await expect(details(page)).toHaveCount(0);
  await expect.poll(() => sheetHeight(page)).toBeGreaterThan(page.viewportSize()!.height * 0.45);
  expect(await sheetHeight(page)).toBeLessThan(page.viewportSize()!.height * 0.55);
  await expect(routePoints(page)).toHaveCount(0);
});
