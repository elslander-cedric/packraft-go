// The base map switcher on the desktop (#179, ADR 0031): a map button bottom right opens the
// three base maps. Each switch loads its own sources and attribution, the choice is a setting
// on the device (never in the trip, its file or the GPX), and a base map that goes less far in
// zooms the map out. Every tile comes from the fixture; no live service is called.
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { downloadGpxZip } from "./support/gpxZip";
import { baseMapItem, chooseBaseMap, mapMenuButton, toggleOverlay } from "./support/mapMenu";
import { serveOffline, tileSourceOf, type TileSource } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const attribution = (page: Page) => mapRegion(page).locator(".leaflet-control-attribution");
const zoomIn = (page: Page) => page.getByRole("button", { name: "Zoom in" });
const tiles = (page: Page) => mapRegion(page).locator(".leaflet-tile-pane img");

/**
 * The sources of the tiles drawn on the map. (The page doesn't ask again for an OpenTopoMap
 * tile it has already loaded, so the requests alone don't show which layers are on.)
 */
async function drawnSources(page: Page) {
  const sources = await tiles(page).evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
  return new Set(sources.map(tileSourceOf));
}

const sorted = (sources: Set<TileSource | null>) => [...sources].sort();

async function openMap(page: Page) {
  const network = await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  return network;
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const box = async (locator: Locator) => (await locator.boundingBox())!;

test("the base map button bottom right switches to aerial photos, NGI topo and back to OpenTopoMap", async ({
  page,
}) => {
  const network = await openMap(page);
  expect(sorted(await drawnSources(page))).toEqual(["opentopomap"]);

  // It sits in the map's bottom-right corner, above the attribution.
  const map = await box(mapRegion(page));
  const button = await box(mapMenuButton(page));
  const credits = await box(attribution(page));
  expect(map.x + map.width - (button.x + button.width)).toBeLessThan(20);
  expect(button.y + button.height).toBeLessThanOrEqual(credits.y + 1);

  // OpenTopoMap is marked as the current one.
  await mapMenuButton(page).click();
  await expect(page.getByRole("menuitemradio")).toHaveText([
    strings.baseMaps.opentopomap,
    strings.baseMaps["aerial-be"],
    strings.baseMaps["ngi-topo"],
  ]);
  await expect(baseMapItem(page, "opentopomap")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  // Aerial photos: the three regions over OpenTopoMap, each credited.
  await chooseBaseMap(page, "aerial-be");
  await expect
    .poll(async () => sorted(await drawnSources(page)))
    .toEqual(["brussels", "flanders", "opentopomap", "wallonia"]);
  await expect(attribution(page)).toContainText("OpenTopoMap");
  await expect(attribution(page)).toContainText("Bron: Luchtopnamen Digitaal Vlaanderen");
  await expect(attribution(page)).toContainText("SPW");
  await expect(attribution(page)).toContainText("paradigm.brussels");

  // NGI topo: CartoWeb.be over OpenTopoMap; the aerial credits are gone.
  await chooseBaseMap(page, "ngi-topo");
  await expect.poll(async () => sorted(await drawnSources(page))).toEqual(["ngi", "opentopomap"]);
  await expect(attribution(page)).toContainText("NGI/IGN");
  await expect(attribution(page)).toContainText("TomTom");
  await expect(attribution(page)).not.toContainText("Digitaal Vlaanderen");

  // Back to OpenTopoMap alone.
  await chooseBaseMap(page, "opentopomap");
  await expect.poll(async () => sorted(await drawnSources(page))).toEqual(["opentopomap"]);
  await expect(attribution(page)).not.toContainText("NGI/IGN");
  await expect(attribution(page)).toContainText("OpenTopoMap");

  // Every source was asked for its tiles, from the fixture.
  expect(sorted(new Set(network.tiles.map((tile) => tile.source)))).toEqual([
    "brussels",
    "flanders",
    "ngi",
    "opentopomap",
    "wallonia",
  ]);

  expect(network.blocked).toEqual([]);
});

test("the chosen base map survives a reload", async ({ page }) => {
  const network = await openMap(page);
  await chooseBaseMap(page, "aerial-be");
  await expect.poll(async () => (await drawnSources(page)).has("flanders")).toBe(true);

  await page.reload();
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect
    .poll(async () => sorted(await drawnSources(page)))
    .toEqual(["brussels", "flanders", "opentopomap", "wallonia"]);
  await expect(attribution(page)).toContainText("Digitaal Vlaanderen");
  await mapMenuButton(page).click();
  await expect(baseMapItem(page, "aerial-be")).toHaveAttribute("aria-checked", "true");
  expect(network.blocked).toEqual([]);
});

test("aerial photos go to zoom 18 and further; switching to OpenTopoMap there zooms out to 17", async ({ page }) => {
  // Steps through ten zoom levels, waiting for each to land.
  test.setTimeout(90_000);
  const network = await openMap(page);
  await chooseBaseMap(page, "aerial-be");
  // The map opens on Wallonia: the Walloon WMS shows each zoom. Leaflet drops clicks during
  // a zoom animation, so wait for each step's tiles and for the animation to end.
  for (let zoom = 9; zoom <= 18; zoom++) {
    await zoomIn(page).click();
    await expect.poll(() => network.tiles.some((tile) => tile.source === "wallonia" && tile.z === zoom)).toBe(true);
    await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  }
  await expect(zoomIn(page)).not.toHaveClass(/leaflet-disabled/);
  // At 18 OpenTopoMap, underneath, shows its zoom 17 tiles enlarged to twice their size.
  const openTopoMapTileWidths = () =>
    tiles(page).evaluateAll((images) =>
      images
        .filter((image) => image.closest(".leaflet-layer")?.querySelector("img[src*='opentopomap']"))
        .map((image) => Math.round(image.getBoundingClientRect().width)),
    );
  expect(new Set(await openTopoMapTileWidths())).toEqual(new Set([512]));

  // OpenTopoMap goes to 17: the map zooms out, its tiles at their own size, and no further zoom in.
  const from = network.tiles.length;
  await chooseBaseMap(page, "opentopomap");
  await expect.poll(async () => new Set(await openTopoMapTileWidths())).toEqual(new Set([256]));
  await expect(zoomIn(page)).toHaveClass(/leaflet-disabled/);
  expect(network.tiles.slice(from).filter((tile) => tile.z > 17)).toEqual([]);
  expect(network.blocked).toEqual([]);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
]) {
  test(`the base map button covers neither the place search bar nor the access overlay (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const network = await openMap(page);
    await page.getByRole("switch", { name: strings.accessLayerToggle }).click();
    await expect(page.locator(".access-overlay .access-legend")).toBeVisible();
    // Aerial photos have the longest attribution, so the button sits highest.
    await chooseBaseMap(page, "aerial-be");
    await page.evaluate(() => document.fonts.ready);

    const button = await box(mapMenuButton(page));
    expect(overlaps(button, await box(page.locator(".place-search-map-bar")))).toBe(false);
    expect(overlaps(button, await box(page.locator(".access-overlay")))).toBe(false);
    // The button is fully inside the map.
    const map = await box(mapRegion(page));
    expect(button.y).toBeGreaterThanOrEqual(map.y);
    expect(button.y + button.height).toBeLessThanOrEqual(map.y + map.height);
    expect(network.blocked).toEqual([]);
  });
}

test("the trip, its file and its GPX never hold the base map or the overlays; the settings do", async ({ page }) => {
  const trip: Trip = {
    name: "Ourthe",
    points: [
      { lat: 50.3, lng: 5.6 },
      { lat: 50.35, lng: 5.65 },
    ],
    legs: [{ mode: "hike" }],
  };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  const network = await openMap(page);
  await chooseBaseMap(page, "aerial-be");
  await toggleOverlay(page, "hiking-trails");

  const stored = await page.evaluate(
    ([trip, settings]) => [localStorage.getItem(trip), localStorage.getItem(settings)],
    [TRIP_KEY, SETTINGS_KEY],
  );
  expect(JSON.parse(stored[1] ?? "{}")).toMatchObject({ baseMap: "aerial-be", overlays: ["hiking-trails"] });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.saveFileButton }).click(),
  ]);
  const file = await readFile((await download.path())!, "utf8");
  const gpx = await downloadGpxZip(page, page.getByRole("button", { name: strings.exportGpxButton }));

  for (const text of [stored[0] ?? "", file, ...gpx.files.map((entry) => entry.text)]) {
    expect(text).not.toBe("");
    expect(text).not.toMatch(/baseMap|aerial-be|opentopomap|ngi-topo|overlays|hiking-trails/i);
  }
  expect(network.blocked).toEqual([]);
});
