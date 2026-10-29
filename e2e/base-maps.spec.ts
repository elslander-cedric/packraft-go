// The base map switcher on a desktop-sized window (#179, ADR 0031): the layers button under the
// position button (ADR 0034) opens the three base maps. Each switch loads its own sources and attribution, the choice is a setting
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
import { baseMapItem, chooseBaseMap, mapMenuButton, toggleAccessLayer, toggleOverlay } from "./support/mapMenu";
import { serveOffline, tileSourceOf, type TileSource } from "./support/offline";
import { freeMapCentre, openPlanner, saveTripFile, startGpxExport, tripPanel } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const attribution = (page: Page) => mapRegion(page).locator(".leaflet-control-attribution");
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
  await openPlanner(page);
  return network;
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const box = async (locator: Locator) => (await locator.boundingBox())!;

test("the layers button switches to aerial photos, NGI topo and back to OpenTopoMap", async ({ page }) => {
  const network = await openMap(page);
  expect(sorted(await drawnSources(page))).toEqual(["opentopomap"]);

  // It sits top right in the part of the map the panel leaves free.
  const map = await box(mapRegion(page));
  const button = await box(mapMenuButton(page));
  const panel = await box(tripPanel(page));
  expect(button.x + button.width).toBeLessThanOrEqual(panel.x);
  expect(panel.x - (button.x + button.width)).toBeLessThan(40);
  expect(button.y - map.y).toBeLessThan(150);

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
  // The map opens on Wallonia: the Walloon WMS shows each zoom. The wheel zooms (the planner
  // has no zoom buttons, ADR 0034); wait for each step's tiles and for the animation to end.
  const centre = await freeMapCentre(page);
  const wheelIn = async () => {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, -60);
    await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  };
  for (let step = 0; step < 30; step++) {
    if (network.tiles.some((tile) => tile.source === "wallonia" && tile.z === 18)) break;
    await wheelIn();
    await page.waitForTimeout(300);
  }
  await expect.poll(() => network.tiles.some((tile) => tile.source === "wallonia" && tile.z === 18)).toBe(true);
  // From 18 OpenTopoMap, underneath, shows its zoom 17 tiles enlarged (twice their size at 18;
  // a wheel turn may have gone a level further).
  const zoom = Math.max(...network.tiles.filter((tile) => tile.source === "wallonia").map((tile) => tile.z));
  const openTopoMapTileWidths = () =>
    tiles(page).evaluateAll((images) =>
      images
        .filter((image) => image.closest(".leaflet-layer")?.querySelector("img[src*='opentopomap']"))
        .map((image) => Math.round(image.getBoundingClientRect().width)),
    );
  await expect.poll(async () => new Set(await openTopoMapTileWidths())).toEqual(new Set([256 * 2 ** (zoom - 17)]));
  expect(zoom).toBeGreaterThanOrEqual(18);

  // OpenTopoMap goes to 17: the map zooms out, its tiles at their own size, and no further zoom in.
  const from = network.tiles.length;
  await chooseBaseMap(page, "opentopomap");
  await expect.poll(async () => new Set(await openTopoMapTileWidths())).toEqual(new Set([256]));
  // The wheel goes no further in.
  await wheelIn();
  await page.waitForTimeout(500);
  expect(network.tiles.slice(from).filter((tile) => tile.z > 17)).toEqual([]);
  expect(network.blocked).toEqual([]);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
]) {
  test(`the layers button covers neither the place search pill nor the access chip (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const network = await openMap(page);
    await toggleAccessLayer(page);
    const chip = page.getByRole("button", { name: /^Access · / });
    await expect(chip).toBeVisible();
    await chooseBaseMap(page, "aerial-be");
    await page.evaluate(() => document.fonts.ready);

    const button = await box(mapMenuButton(page));
    const pill = page.getByRole("button", { name: strings.placeSearch.pill(undefined) });
    expect(overlaps(button, await box(pill))).toBe(false);
    expect(overlaps(button, await box(chip))).toBe(false);
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

  const download = await saveTripFile(page);
  const file = await readFile((await download.path())!, "utf8");
  const gpx = await downloadGpxZip(page, () => startGpxExport(page));

  for (const text of [stored[0] ?? "", file, ...gpx.files.map((entry) => entry.text)]) {
    expect(text).not.toBe("");
    expect(text).not.toMatch(/baseMap|aerial-be|opentopomap|ngi-topo|overlays|hiking-trails/i);
  }
  expect(network.blocked).toEqual([]);
});
