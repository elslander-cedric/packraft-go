// The Hiking trails overlay on the desktop (#180, ADR 0032): the Map button bottom right lists
// the base maps, then the overlay's switch. Switched on, the trails are drawn over any base map,
// under the access layer and the trip, credited in the attribution, and remembered in the
// settings (never in the trip). Every tile comes from the fixture; no live service is called.
import { expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { baseMapItem, mapMenuButton, overlayItem, toggleOverlay } from "./support/mapMenu";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const attribution = (page: Page) => mapRegion(page).locator(".leaflet-control-attribution");
const zoomIn = (page: Page) => page.getByRole("button", { name: "Zoom in" });
const trailTiles = (page: Page) => mapRegion(page).locator("img.leaflet-tile-loaded[src*='waymarkedtrails']");

async function openMap(page: Page) {
  const network = await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  return network;
}

/** The z-index of the pane an element is drawn in. */
const paneZIndex = (page: Page, selector: string) =>
  mapRegion(page)
    .locator(selector)
    .first()
    .evaluate((element) => Number(getComputedStyle(element.closest(".leaflet-pane")!).zIndex));

test("the Map button lists the base maps, then the Hiking trails switch, off at first", async ({ page }) => {
  const network = await openMap(page);
  await mapMenuButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    strings.baseMaps.opentopomap,
    strings.baseMaps["aerial-be"],
    strings.baseMaps["ngi-topo"],
  ]);
  await expect(menu.getByRole("menuitemcheckbox")).toHaveText([strings.overlays["hiking-trails"]]);
  await expect(overlayItem(page, "hiking-trails")).toHaveAttribute("aria-checked", "false");
  // The switch comes after the base maps, below a divider; the access layer is not in this menu.
  const lastBaseMap = (await baseMapItem(page, "ngi-topo").boundingBox())!;
  const trails = (await overlayItem(page, "hiking-trails").boundingBox())!;
  expect(trails.y).toBeGreaterThan(lastBaseMap.y + lastBaseMap.height - 1);
  await expect(menu.getByRole("separator")).toHaveCount(1);
  await expect(menu.getByText(strings.accessLayerToggle)).toHaveCount(0);
  expect(network.tiles.filter((tile) => tile.source === "hiking-trails")).toEqual([]);
  expect(network.blocked).toEqual([]);
});

test("switching Hiking trails on draws them under the access layer and the trip, credited; off removes them", async ({
  page,
}) => {
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

  await toggleOverlay(page, "hiking-trails");
  await expect(trailTiles(page).first()).toBeVisible();
  expect(network.tiles.some((tile) => tile.source === "hiking-trails")).toBe(true);
  await expect(attribution(page)).toContainText("Waymarked Trails");
  await expect(attribution(page)).toContainText("CC BY-SA");

  // Above the base map, below the access layer's waters and the trip's legs.
  await page.getByRole("switch", { name: strings.accessLayerToggle }).click();
  await expect(mapRegion(page).locator(".leaflet-access-pane path").first()).toBeAttached();
  const trails = await paneZIndex(page, "img[src*='waymarkedtrails']");
  expect(trails).toBeGreaterThan(await paneZIndex(page, "img[src*='opentopomap']"));
  expect(trails).toBeLessThan(await paneZIndex(page, ".leaflet-access-pane path"));
  expect(trails).toBeLessThan(await paneZIndex(page, ".leaflet-overlay-pane path"));
  expect(trails).toBeLessThan(await paneZIndex(page, ".leaflet-trip-points-pane > *"));

  await toggleOverlay(page, "hiking-trails");
  await expect(trailTiles(page)).toHaveCount(0);
  await expect(attribution(page)).not.toContainText("Waymarked Trails");
  expect(network.blocked).toEqual([]);
});

test("Hiking trails stay on after a reload, kept in the settings and never in the trip", async ({ page }) => {
  const network = await openMap(page);
  await toggleOverlay(page, "hiking-trails");
  await expect(trailTiles(page).first()).toBeVisible();

  await page.reload();
  await expect(trailTiles(page).first()).toBeVisible();
  await mapMenuButton(page).click();
  await expect(overlayItem(page, "hiking-trails")).toHaveAttribute("aria-checked", "true");

  const [trip, settings] = await page.evaluate(
    ([trip, settings]) => [localStorage.getItem(trip), localStorage.getItem(settings)],
    [TRIP_KEY, SETTINGS_KEY],
  );
  expect(JSON.parse(settings ?? "{}")).toMatchObject({ overlays: ["hiking-trails"] });
  expect(trip ?? "").not.toMatch(/overlay|hiking-trails/i);
  expect(network.blocked).toEqual([]);
});

test("on aerial photos at zoom 19 the trails stay drawn, enlarged from their zoom 18 tiles", async ({ page }) => {
  // Steps through eleven zoom levels, waiting for each to land.
  test.setTimeout(120_000);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [
      SETTINGS_KEY,
      JSON.stringify({ paceFactor: 1, paddleSpeedKmh: 5, baseMap: "aerial-be", overlays: ["hiking-trails"] }),
    ],
  );
  const network = await openMap(page);
  // Leaflet drops clicks during a zoom animation, so wait for each step's tiles and for the animation to end.
  for (let zoom = 9; zoom <= 19; zoom++) {
    await zoomIn(page).click();
    await expect.poll(() => network.tiles.some((tile) => tile.source === "wallonia" && tile.z === zoom)).toBe(true);
    await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  }
  await expect(zoomIn(page)).toHaveClass(/leaflet-disabled/);
  await expect(trailTiles(page).first()).toBeVisible();
  const widths = await trailTiles(page).evaluateAll((images) =>
    images.map((image) => Math.round(image.getBoundingClientRect().width)),
  );
  expect(new Set(widths)).toEqual(new Set([512]));
  const trailZooms = network.tiles.filter((tile) => tile.source === "hiking-trails").map((tile) => tile.z);
  expect(Math.max(...trailZooms)).toBe(18);
  expect(network.blocked).toEqual([]);
});
