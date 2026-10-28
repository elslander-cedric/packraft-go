// Point editing by touch on the phone (#120, ADR 0026): tap a point to select it, delete and
// camp buttons while it is selected, press and drag a point or an access point (the map
// never pans), and the access-point button on a selected point.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { touch } from "./support/touch";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const routed = {
  brouter: () => ({
    status: 200,
    body: brouterFixture("hiking-success.geojson"),
  }),
};

const text = strings.phone;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const hitAreas = (page: Page) => mapRegion(page).locator("path.point-hit");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const camps = (page: Page) => mapRegion(page).locator(".camp-marker");
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const deleteButton = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const markButton = (page: Page) => page.getByRole("button", { name: text.markAccessPointButton });
const editDialog = (page: Page) => page.getByRole("dialog", { name: text.accessPointDialogTitle });
const pointToAccessButton = (page: Page) => page.getByRole("button", { name: text.selectedPointToAccessPointButton });

/** Your access points as saved on the device. */
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), ACCESS_POINTS_KEY);

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the map's pane is shifted to: it changes when the map pans. */
const mapOffset = (page: Page) =>
  mapRegion(page)
    .locator(".leaflet-map-pane")
    .evaluate((element) => {
      const m = new DOMMatrix(getComputedStyle(element).transform);
      return { x: m.m41, y: m.m42 };
    });

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** A spot on the map, as an offset from the centre of its upper part (above the sheet's peek). */
async function spot(page: Page, dx: number, dy: number) {
  const box = (await mapRegion(page).boundingBox())!;
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 3 + dy };
}

/** Waits for the sheet to stop moving (it slides between stops). */
async function sheetSettled(page: Page) {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await sheet(page).boundingBox());
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [200] },
    )
    .toBe(true);
}

async function tapAt(page: Page, at: { x: number; y: number }) {
  await page.touchscreen.tap(at.x, at.y);
}

/** Adds two points by tapping the map, and waits for their leg to be routed. */
async function twoPoints(page: Page) {
  const a = await spot(page, -100, 0);
  const b = await spot(page, 80, 0);
  await tapAt(page, a);
  await expect(points(page)).toHaveCount(1);
  await tapAt(page, b);
  await expect(points(page)).toHaveCount(2);
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);
  return { a, b };
}

test("a tap selects a point; delete and camp appear; delete removes it", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  await twoPoints(page);
  await expect(deleteButton(page)).toHaveCount(0);
  await expect(campButton(page)).toHaveCount(0);

  await tapAt(page, await centreOf(points(page).nth(1)));
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);
  await expect(points(page)).toHaveCount(2); // the tap added nothing
  await expect(deleteButton(page)).toBeVisible();
  await expect(campButton(page)).toBeVisible();

  await deleteButton(page).click();
  await expect(points(page)).toHaveCount(1);
  await expect(deleteButton(page)).toHaveCount(0);
});

test("camp marks the selected point, and a map tap with a selection only deselects", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  await twoPoints(page);

  await tapAt(page, await centreOf(points(page).nth(0)));
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "false");
  await campButton(page).click();
  await expect(camps(page)).toHaveCount(1);
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "true");

  // A tap on the map clears the selection and adds no point.
  await tapAt(page, await spot(page, 0, 120));
  await expect(points(page).nth(0)).not.toHaveClass(/point-selected/);
  await expect(deleteButton(page)).toHaveCount(0);
  await expect(points(page)).toHaveCount(2);
  // The next tap adds a point again.
  await tapAt(page, await spot(page, 40, 140));
  await expect(points(page)).toHaveCount(3);
});

test("a point's hit area is at least 44 px", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  await twoPoints(page);
  await expect(hitAreas(page)).toHaveCount(2);
  const box = (await hitAreas(page).first().boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // A tap near the edge of the hit area, off the drawn point, still selects it.
  const centre = await centreOf(points(page).nth(1));
  await tapAt(page, { x: centre.x + 18, y: centre.y });
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);
});

test("a finger drags a point: it moves, the map does not pan, the legs are routed again, undo restores it", async ({
  page,
}) => {
  const network = await serveOffline(page, routed);
  await openPhone(page);
  const { b } = await twoPoints(page);
  expect(network.brouter).toHaveLength(1);

  const offsetBefore = await mapOffset(page);
  const moved = { x: b.x + 20, y: b.y + 100 };
  const fingers = await touch(page);
  await fingers.drag(await centreOf(points(page).nth(1)), moved);

  await expect.poll(async () => (await centreOf(points(page).nth(1))).y).toBeGreaterThan(b.y + 80);
  const after = await centreOf(points(page).nth(1));
  expect(Math.abs(after.x - moved.x)).toBeLessThan(4);
  expect(Math.abs(after.y - moved.y)).toBeLessThan(4);
  expect(await mapOffset(page)).toEqual(offsetBefore);
  await expect(points(page)).toHaveCount(2);
  await expect.poll(() => network.brouter.length).toBe(2);
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);

  await undoButton(page).click();
  await expect.poll(async () => (await centreOf(points(page).nth(1))).y).toBeLessThan(b.y + 4);
  expect(network.blocked).toEqual([]);
});

test("while a point is dragged its legs are dashed straight lines", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  await twoPoints(page);
  const offsetBefore = await mapOffset(page);
  const from = await centreOf(points(page).nth(1));
  const finger = await (await touch(page)).press(from);
  await finger.moveTo({ x: from.x, y: from.y + 30 });
  await finger.moveTo({ x: from.x, y: from.y + 60 });
  await expect(legLines(page).first()).toHaveClass(/leg-dragged/);
  await expect(legLines(page).first()).toHaveAttribute("stroke-dasharray", /\d/);
  await finger.release();
  await expect(legLines(page).first()).not.toHaveClass(/leg-dragged/);
  expect(await mapOffset(page)).toEqual(offsetBefore);
});

test.describe("in a narrowed desktop window", () => {
  test.use({ viewport: { width: 600, height: 900 }, hasTouch: false, isMobile: false, userAgent: undefined });

  test("with a mouse, press-and-drag moves a point", async ({ page }) => {
    await serveOffline(page, routed);
    await openPhone(page);
    await expect(sheet(page)).toBeVisible(); // the phone layout
    const a = await spot(page, -100, 0);
    const b = await spot(page, 80, 0);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await expect(points(page)).toHaveCount(2);

    const offsetBefore = await mapOffset(page);
    const from = await centreOf(points(page).nth(1));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 50, { steps: 5 });
    await page.mouse.move(from.x + 20, from.y + 100, { steps: 5 });
    await page.mouse.up();

    await expect.poll(async () => (await centreOf(points(page).nth(1))).y).toBeGreaterThan(from.y + 80);
    expect(await mapOffset(page)).toEqual(offsetBefore);
    await expect(points(page)).toHaveCount(2);
  });
});

test("with a point selected, the access-point button makes it an access point", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  await twoPoints(page);
  await expect(markButton(page)).toBeVisible();

  const at = await centreOf(points(page).nth(0));
  await tapAt(page, at);
  await expect(pointToAccessButton(page)).toBeVisible();
  await pointToAccessButton(page).click();
  // Its details open; Cancel keeps the new point.
  await expect(editDialog(page)).toBeVisible();
  await editDialog(page).getByRole("button", { name: strings.confirmCancel }).click();

  await expect(markers(page)).toHaveCount(1);
  const marker = await centreOf(markers(page).first());
  expect(Math.abs(marker.x - at.x)).toBeLessThan(3);
  expect(Math.abs(marker.y - at.y)).toBeLessThan(3);
  // The route point is no longer selected, so the button marks at your position again.
  await expect(deleteButton(page)).toHaveCount(0);
  await expect(markButton(page)).toBeVisible();
  expect((await stored(page)).accessPoints).toHaveLength(1);
});

test("a route point under an access point can still be selected and dragged", async ({ page }) => {
  await serveOffline(page, routed);
  await openPhone(page);
  await twoPoints(page);
  const at = await centreOf(points(page).nth(0));
  await tapAt(page, at);
  await pointToAccessButton(page).click();
  await editDialog(page).getByRole("button", { name: strings.confirmCancel }).click();
  await expect(editDialog(page)).toHaveCount(0);
  await expect(markers(page)).toHaveCount(1);
  // The new access point raised the sheet to half, over the point: lower it to the peek again.
  await sheetSettled(page);
  const box = (await sheet(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 208, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + 408, { steps: 5 });
  await page.mouse.up();
  await sheetSettled(page);
  expect(await centreOf(points(page).nth(0))).toEqual(at);

  // A tap there selects the route point, not the access point on top of it.
  await tapAt(page, at);
  await expect(points(page).nth(0)).toHaveClass(/point-selected/);
  await expect(deleteButton(page)).toBeVisible();

  // A drag there moves the route point; the access point stays where it was.
  const offsetBefore = await mapOffset(page);
  const to = { x: at.x + 30, y: at.y + 90 };
  await (await touch(page)).drag(at, to);
  await expect.poll(async () => (await centreOf(points(page).nth(0))).y).toBeGreaterThan(at.y + 70);
  const marker = await centreOf(markers(page).first());
  expect(Math.abs(marker.x - at.x)).toBeLessThan(3);
  expect(Math.abs(marker.y - at.y)).toBeLessThan(3);
  expect(await mapOffset(page)).toEqual(offsetBefore);
});

const slipway: AccessPoint = {
  id: "ap-1",
  position: { lat: 50.268, lng: 5.446 },
  name: "",
  nameSource: "to-look-up",
  use: "put-in",
  kind: "slipway",
  note: "Hotton slipway",
  checkedOnSite: null,
  createdAt: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
};

test("a finger drags an access point: it moves, is saved on the device, and the map does not pan", async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [ACCESS_POINTS_KEY, serialiseAccessPoints([slipway])],
  );
  await openPhone(page);
  await expect(markers(page)).toHaveCount(1);
  // Bring the marker into the free part of the map: open its row, which centres it above the sheet.
  await sheet(page).getByRole("tab", { name: text.tabs.accessPoints }).click();
  await sheet(page)
    .getByRole("region", { name: text.accessPointsLabel, exact: true })
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .first()
    .click();
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await mapOffset(page));
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [200] },
    )
    .toBe(true);

  const box = (await markers(page).first().boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  const offsetBefore = await mapOffset(page);
  const from = await centreOf(markers(page).first());
  const to = { x: from.x + 60, y: from.y - 40 };
  await (await touch(page)).drag(from, to);

  await expect.poll(async () => (await centreOf(markers(page).first())).x).toBeGreaterThan(from.x + 50);
  expect(await mapOffset(page)).toEqual(offsetBefore);
  await expect(points(page)).toHaveCount(0); // the drag added no route point
  const storedPoints = await stored(page);
  expect(storedPoints.accessPoints[0].position.lng).toBeGreaterThan(slipway.position.lng);
  expect(storedPoints.accessPoints[0].position.lat).toBeGreaterThan(slipway.position.lat);
});
