// #117: a finger can drag a point on the desktop layout (a tablet), and the touch helper works.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { touch } from "./support/touch";

// A tall touch tablet keeps the desktop layout (see acceptance-71).
test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const mapOffset = (page: Page) =>
  mapRegion(page)
    .locator(".leaflet-map-pane")
    .evaluate((element) => {
      const m = new DOMMatrix(getComputedStyle(element).transform);
      return { x: m.m41, y: m.m42 };
    });

const zoomLevel = (page: Page) =>
  mapRegion(page).evaluate((element) => {
    // Tile URLs carry the zoom: read it from a loaded tile.
    const tile = element.querySelector<HTMLImageElement>("img.leaflet-tile-loaded");
    return tile ? tile.src : "";
  });

async function openMap(page: Page, options: Parameters<typeof serveOffline>[1] = {}) {
  const network = await serveOffline(page, options);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { network, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

test("a finger drags a point, the map does not pan, and the legs are routed again", async ({ page }) => {
  const { network, cx, cy } = await openMap(page, {
    brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }),
  });
  const a = { x: cx - 120, y: cy };
  const b = { x: cx + 40, y: cy };
  for (const p of [a, b]) await page.mouse.click(p.x, p.y);
  await expect(points(page)).toHaveCount(2);
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);
  expect(network.brouter).toHaveLength(1);

  const offsetBefore = await mapOffset(page);
  const moved = { x: b.x + 20, y: b.y + 140 };
  await (await touch(page)).drag(await centreOf(points(page).nth(1)), moved);

  await expect.poll(async () => (await centreOf(points(page).nth(1))).y).toBeGreaterThan(b.y + 100);
  const after = await centreOf(points(page).nth(1));
  expect(Math.abs(after.x - moved.x)).toBeLessThan(4);
  expect(Math.abs(after.y - moved.y)).toBeLessThan(4);
  // The map did not pan, and dragging added no point.
  expect(await mapOffset(page)).toEqual(offsetBefore);
  await expect(points(page)).toHaveCount(2);
  // The moved point's leg is routed again, from the recorded fixture.
  await expect.poll(() => network.brouter.length).toBe(2);
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);
  expect(network.blocked).toEqual([]);
});

test("a finger dragging empty map pans it", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  const before = await mapOffset(page);
  await (await touch(page)).drag({ x: cx, y: cy }, { x: cx + 100, y: cy + 80 });
  await expect.poll(async () => (await mapOffset(page)).x).toBeGreaterThan(before.x + 50);
});

test("two fingers pinching apart zoom the map in", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  const before = await zoomLevel(page);
  await (await touch(page)).pinch({ x: cx, y: cy }, 4);
  await expect.poll(() => zoomLevel(page)).not.toBe(before);
});

test("a held finger on empty map still ends as a click and adds a point", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  await (await touch(page)).hold({ x: cx, y: cy }, 300);
  await expect(points(page)).toHaveCount(1);
});
