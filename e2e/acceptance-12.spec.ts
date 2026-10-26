// Acceptance tests for #12 (app skeleton) written from the
// issue's acceptance criteria. They observe only what a user would see:
// rendered tile images, visible text and network traffic.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

// Rough bounding box of Belgium, independent of the app's config.
const BELGIUM = { south: 49.49, north: 51.51, west: 2.54, east: 6.41 };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });

/**
 * Works out the geographic point under the centre of the map region from the
 * tile images the user can see (slippy-map tile maths), plus the zoom level
 * of the tile under the centre.
 */
async function visibleCentre(page: Page) {
  const box = await mapRegion(page).boundingBox();
  if (!box) throw new Error("map has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // The tile the user sees is the loaded tile under the centre in the level
  // drawn on top (highest stacking order). Tiles ignore pointer events, so
  // elementsFromPoint can't be used.
  const top = await page.evaluate(
    ([x, y]) => {
      const under = Array.from(document.querySelectorAll("img.leaflet-tile-loaded"))
        .map((img) => ({ img: img as HTMLImageElement, r: img.getBoundingClientRect() }))
        .filter(({ r }) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)
        .map((t) => ({ ...t, zi: Number(getComputedStyle(t.img.parentElement!).zIndex) || 0 }))
        .sort((p, q) => q.zi - p.zi);
      const t = under[0];
      return t ? { src: t.img.src, x: t.r.x, y: t.r.y, w: t.r.width, h: t.r.height } : null;
    },
    [cx, cy] as const,
  );
  if (!top) throw new Error("no tile under the map centre");
  const m = new URL(top.src).pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!m) throw new Error(`unexpected tile url ${top.src}`);
  const tile = { ...top, z: Number(m[1]), tx: Number(m[2]), ty: Number(m[3]) };
  const n = 2 ** tile.z;
  const fx = tile.tx + (cx - tile.x) / tile.w;
  const fy = tile.ty + (cy - tile.y) / tile.h;
  const lng = (fx / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n))) * 180) / Math.PI;
  return { lat, lng, z: tile.z };
}

/** Zoom level of the visible map once it has stopped changing. */
async function settledZoom(page: Page) {
  let last = NaN;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const z = (await visibleCentre(page)).z;
    if (z === last) return z;
    last = z;
  }
  throw new Error("map zoom never settled");
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe("#12 acceptance", () => {
  test("map opens centred on Belgium at a country-wide zoom", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();

    const c = await visibleCentre(page);
    expect(c.lat).toBeGreaterThan(BELGIUM.south);
    expect(c.lat).toBeLessThan(BELGIUM.north);
    expect(c.lng).toBeGreaterThan(BELGIUM.west);
    expect(c.lng).toBeLessThan(BELGIUM.east);
    expect(c.z).toBeGreaterThanOrEqual(6);
    expect(c.z).toBeLessThanOrEqual(9);
  });

  test("map is pannable and zoomable with mouse and controls", async ({ page }) => {
    // Steps through every zoom level, waiting for each to settle.
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const network = await serveOffline(page);
    await page.goto("/");
    const map = mapRegion(page);
    await expect(map.locator("img.leaflet-tile-loaded").first()).toBeVisible();
    const start = await visibleCentre(page);

    // Drag the map to the left: the view moves east.
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 400, cy, { steps: 20 });
    await page.mouse.up();
    await expect.poll(async () => (await visibleCentre(page)).lng).toBeGreaterThan(start.lng + 0.5);

    // Mouse-wheel zoom in.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -500);
    await expect.poll(async () => (await visibleCentre(page)).z).toBeGreaterThan(start.z);
    await settledZoom(page);

    // Zoom buttons, clicked repeatedly to the limits: no crash. Leaflet drops
    // clicks during a zoom animation, so wait for each step to land.
    const stepTo = async (name: "Zoom in" | "Zoom out", dir: 1 | -1) => {
      const button = page.getByRole("button", { name });
      for (let i = 0; i < 25; i++) {
        const before = await settledZoom(page);
        if (await button.isDisabled()) return;
        await button.click();
        await expect
          .poll(async () => (await visibleCentre(page)).z * dir)
          .toBeGreaterThan(before * dir);
      }
      throw new Error(`${name} never reached its limit`);
    };
    await stepTo("Zoom out", -1);
    expect(await settledZoom(page)).toBeLessThan(start.z);
    await expect(page.getByText(strings.navigationRulesNotice)).toBeVisible();
    await stepTo("Zoom in", 1);
    expect(await settledZoom(page)).toBe(17);
    await expect(page.getByText(strings.navigationRulesNotice)).toBeVisible();

    expect(network.blocked).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("server renders the page without the map and without errors", async ({ page }) => {
    const res = await page.request.get("/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    // The notice is server-rendered; Leaflet's container is not.
    expect(html).toContain("Indicative only");
    expect(html).not.toContain("leaflet-container");
    expect(html).not.toMatch(/window is not defined/i);

    const errors = collectErrors(page);
    await serveOffline(page);
    await page.goto("/");
    await expect(mapRegion(page).locator(".leaflet-container")).toBeVisible();
    // A reload behaves the same.
    await page.reload();
    await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("credits and notice are visible on screen, with working links", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await serveOffline(page);
    await page.goto("/");

    const notice = page.getByText(strings.navigationRulesNotice);
    await expect(notice).toBeVisible();
    await expect(notice).toBeInViewport({ ratio: 1 });
    await expect(notice).toContainText("checking local rules");

    const attribution = page.locator(".leaflet-control-attribution");
    await expect(attribution).toBeInViewport({ ratio: 1 });
    for (const [name, host] of [
      ["OpenStreetMap", "openstreetmap.org"],
      ["OpenTopoMap", "opentopomap.org"],
      ["BRouter", "brouter.de"],
    ] as const) {
      const link = attribution.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      expect(new URL((await link.getAttribute("href"))!).hostname).toContain(host);
    }
  });

  test("notice and credits survive tile server failures", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route(
      (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
      (route) => route.fulfill({ status: 503, body: "" }),
    );
    await page.goto("/");
    await expect(mapRegion(page).locator(".leaflet-container")).toBeVisible();
    await expect(page.getByText(strings.navigationRulesNotice)).toBeVisible();
    await expect(page.locator(".leaflet-control-attribution")).toContainText("BRouter");
    // Failed tile images log resource errors; anything else is a real failure.
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});
