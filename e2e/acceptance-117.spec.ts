// #117 acceptance: the touch-action rule does not break pinch zoom, panning after a drag, or the mouse.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { touch } from "./support/touch";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const tileZoom = (el: Element) =>
  Number(el.querySelector<HTMLImageElement>("img.leaflet-tile-loaded")?.src.match(/\/(\d+)\/\d+\/\d+/)?.[1]);
const zoom = (page: Page) => mapRegion(page).evaluate(tileZoom);
const offset = (page: Page) =>
  mapRegion(page)
    .locator(".leaflet-map-pane")
    .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);
const touchAction = (page: Page) => page.locator(".leaflet-container").first().evaluate((e) => getComputedStyle(e).touchAction);

async function open(page: Page) {
  await serveOffline(page, { brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }) });
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const b = (await mapRegion(page).boundingBox())!;
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

test.describe("touch tablet", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test("pinch out zooms in, pinch in zooms out", async ({ page }) => {
    const { cx, cy } = await open(page);
    const z0 = await zoom(page);
    await (await touch(page)).pinch({ x: cx, y: cy }, 4);
    await expect.poll(() => zoom(page)).toBeGreaterThan(z0);
    // Leaflet ignores a new pinch while the zoom animation runs: let it settle.
    await expect(mapRegion(page).locator(".leaflet-zoom-anim")).toHaveCount(0);
    await page.waitForTimeout(800);
    const z1 = await zoom(page);
    await (await touch(page)).pinch({ x: cx, y: cy }, 0.25);
    // Old tiles linger while new ones load: the lowest loaded zoom shows the zoom-out.
    const lowest = () =>
      mapRegion(page).evaluate((el) =>
        Math.min(
          ...[...el.querySelectorAll<HTMLImageElement>("img.leaflet-tile-loaded")].map((t) =>
            Number(t.src.match(/\/(\d+)\/\d+\/\d+/)?.[1]),
          ),
        ),
      );
    await expect.poll(lowest).toBeLessThan(z1);
  });

  test("a pinch starting over a point zooms and adds no point", async ({ page }) => {
    const { cx, cy } = await open(page);
    await page.mouse.click(cx, cy);
    await expect(points(page)).toHaveCount(1);
    const z0 = await zoom(page);
    await (await touch(page)).pinch({ x: cx, y: cy }, 4);
    await expect.poll(() => zoom(page)).toBeGreaterThan(z0);
    await expect(points(page)).toHaveCount(1);
  });

  test("after a finger drag of a point the map pans again", async ({ page }) => {
    const { cx, cy } = await open(page);
    await page.mouse.click(cx - 100, cy);
    await page.mouse.click(cx + 40, cy);
    const p = (await points(page).nth(1).boundingBox())!;
    const t = await touch(page);
    await t.drag({ x: p.x + p.width / 2, y: p.y + p.height / 2 }, { x: cx + 60, y: cy + 120 });
    await expect(points(page)).toHaveCount(2);
    expect(await touchAction(page)).toBe("none");
    const before = await offset(page);
    await t.drag({ x: cx - 200, y: cy - 300 }, { x: cx - 100, y: cy - 300 });
    await expect.poll(() => offset(page)).toBeGreaterThan(before + 50);
  });
});

test.describe("desktop mouse", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("mouse drag moves a point; wheel zoom works", async ({ page }) => {
    const { cx, cy } = await open(page);
    await page.mouse.click(cx, cy);
    const p = (await points(page).first().boundingBox())!;
    const sx = p.x + p.width / 2;
    const sy = p.y + p.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 80, sy + 60, { steps: 8 });
    await page.mouse.up();
    const q = (await points(page).first().boundingBox())!;
    expect(Math.abs(q.x + q.width / 2 - (sx + 80))).toBeLessThan(4);
    const z0 = await zoom(page);
    await page.mouse.move(cx + 200, cy + 200);
    await page.mouse.wheel(0, -600);
    await expect.poll(() => zoom(page)).toBeGreaterThan(z0);
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  test("pinch zoom works on the phone map", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    const map = page.locator(".leaflet-container").first();
    await expect(map.locator("img.leaflet-tile-loaded").first()).toBeVisible();
    const b = (await map.boundingBox())!;
    const z0 = await map.evaluate(tileZoom);
    await (await touch(page)).pinch({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, 4);
    await expect.poll(() => map.evaluate(tileZoom)).toBeGreaterThan(z0);
  });
});
