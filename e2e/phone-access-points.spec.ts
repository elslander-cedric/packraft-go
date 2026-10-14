// Marking access points on the phone (#63, ADR 0023): at your GPS position,
// saved on the device at once (offline too), draggable, editable, and a
// tap-on-the-map fallback when location is denied.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { confirmDialog } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.accessPoints;
const phoneText = strings.phone;
const ACCESS_POINTS_KEY = "packraft-go.access-points";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const section = (page: Page) => page.getByRole("region", { name: phoneText.accessPointsLabel, exact: true });
const form = (page: Page) => page.getByRole("region", { name: text.detailsLabel, exact: true });
const markButton = (page: Page) => section(page).getByRole("button", { name: phoneText.markButton });
const listItems = (page: Page) => section(page).getByRole("list").getByRole("listitem");
const toggle = (page: Page, group: string, option: string) =>
  form(page).getByRole("group", { name: group }).getByRole("button", { name: option });

const AT_HOTTON = { latitude: 50.268, longitude: 5.446 };

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), ACCESS_POINTS_KEY);

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

test("mark a point at your GPS position, with accuracy, and it is saved on the device at once", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 12 });
  await serveOffline(page);
  await openPhone(page);

  await expect(section(page)).toContainText(phoneText.noAccessPoints);
  await markButton(page).click();

  await expect(markers(page)).toHaveCount(1);
  await expect(form(page)).toBeVisible();
  await expect(section(page)).toContainText(phoneText.markedAccuracy("12 m"));
  await expect(section(page).getByRole("status").filter({ hasText: phoneText.savedOnDevice })).toBeVisible();
  const [point] = (await stored(page)).accessPoints;
  expect(point.position.lat).toBeCloseTo(AT_HOTTON.latitude, 4);
  expect(point.position.lng).toBeCloseTo(AT_HOTTON.longitude, 4);

  // The touch-friendly form: use, kind, note, checked on site (today).
  await toggle(page, text.useLabel, text.uses["put-in"]).click();
  await toggle(page, text.kindLabel, text.kinds.slipway).click();
  await form(page).getByLabel(text.noteLabel).fill("Slipway by the bridge");
  await form(page).getByRole("button", { name: text.checkedTodayButton }).click();
  await expect(form(page).getByLabel(text.checkedOnSiteLabel)).not.toHaveValue("");
  await expect.poll(async () => (await stored(page)).accessPoints[0].note).toBe("Slipway by the bridge");
  const saved = (await stored(page)).accessPoints[0];
  expect(saved).toMatchObject({ use: "put-in", kind: "slipway" });
  expect(saved.checkedOnSite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // Large tap targets (at least 44 px).
  expect((await markButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await toggle(page, text.kindLabel, text.kinds.jetty).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("mark another point offline; both survive a reload and show on the desktop", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 10 });
  await serveOffline(page);
  await openPhone(page);
  await markButton(page).click();
  await expect(markers(page)).toHaveCount(1);

  // No signal: the GPS still works, and marking needs no network.
  await context.setOffline(true);
  await markButton(page).click();
  await expect(markers(page)).toHaveCount(2);
  await expect(section(page).getByRole("status").filter({ hasText: phoneText.savedOnDevice })).toBeVisible();
  await expect.poll(async () => (await stored(page)).accessPoints.length).toBe(2);

  await context.setOffline(false);
  await page.reload();
  await expect(markers(page)).toHaveCount(2);
  await expect(listItems(page)).toHaveCount(2);

  // The same two points on the desktop layout.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByRole("complementary", { name: text.panelLabel })).toContainText(text.count(2));
  await expect(markers(page)).toHaveCount(2);
});

test("drag a marked point to correct it", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 30 });
  await serveOffline(page);
  await openPhone(page);
  await markButton(page).click();
  await expect(markers(page)).toHaveCount(1);
  const before = (await stored(page)).accessPoints[0].position;

  const box = (await markers(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await stored(page)).accessPoints[0].position.lng).toBeGreaterThan(before.lng);
  await expect(markers(page)).toHaveCount(1);
});

test("edit and delete points from the list", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 10 });
  await serveOffline(page);
  await openPhone(page);
  await markButton(page).click();
  await expect(form(page)).toBeVisible();
  await form(page).getByRole("button", { name: text.closeButton }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(listItems(page)).toHaveCount(1);
  await expect(listItems(page).first()).toContainText(text.uses.both);

  // Edit.
  await listItems(page).first().getByRole("button", { name: phoneText.editButton }).click();
  await toggle(page, text.useLabel, text.uses["take-out"]).click();
  await expect(listItems(page).first()).toContainText(text.uses["take-out"]);
  await expect.poll(async () => (await stored(page)).accessPoints[0].use).toBe("take-out");

  // Delete, after confirming.
  await listItems(page).first().getByRole("button", { name: phoneText.deleteListButton }).click();
  await expect(confirmDialog(page)).toHaveAccessibleName(text.deleteConfirm.title);
  await confirmDialog(page).getByRole("button", { name: strings.confirmCancel }).click();
  await expect(listItems(page)).toHaveCount(1);
  await listItems(page).first().getByRole("button", { name: phoneText.deleteListButton }).click();
  await confirmDialog(page).getByRole("button", { name: text.deleteConfirm.confirm }).click();
  await expect(listItems(page)).toHaveCount(0);
  await expect(markers(page)).toHaveCount(0);
  expect((await stored(page)).accessPoints).toEqual([]);
});

test("a denied location permission falls back to placing the point by tapping the map", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);
  // Chromium answers without asking when the permission was never granted; make the denial explicit.
  await page.evaluate(() => {
    const denied = { code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    navigator.geolocation.watchPosition = (_success, failure) => {
      failure?.(denied as GeolocationPositionError);
      return 0;
    };
  });

  await markButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: strings.phone.positionDenied })).toBeVisible();
  await expect(section(page)).toContainText(phoneText.tapToPlaceFallback);
  await expect(markers(page)).toHaveCount(0);

  const box = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  await expect(markers(page)).toHaveCount(1);
  await expect(form(page)).toBeVisible();
  await expect(section(page).getByRole("status").filter({ hasText: phoneText.savedOnDevice })).toBeVisible();
  expect((await stored(page)).accessPoints).toHaveLength(1);
});
