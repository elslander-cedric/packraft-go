// The Hiking trails overlay on the phone (#180, ADR 0032): the Map menu lists the base maps,
// then the access layer and Hiking trails switches. The overlay is the same setting as on the
// desktop and is remembered after a reload. Every tile comes from the fixture; no live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { accessLayerItem, mapMenuButton, overlayItem, toggleOverlay } from "./support/mapMenu";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const trailTiles = (page: Page) => mapRegion(page).locator("img.leaflet-tile-loaded[src*='waymarkedtrails']");

async function openPhone(page: Page) {
  const network = await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  return network;
}

test("the Map menu has the Hiking trails switch after the access layer's, in the same group", async ({ page }) => {
  const network = await openPhone(page);
  await mapMenuButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemcheckbox")).toHaveText([
    strings.accessLayerToggle,
    strings.overlays["hiking-trails"],
  ]);
  await expect(overlayItem(page, "hiking-trails")).toHaveAttribute("aria-checked", "false");
  await expect(menu.getByRole("separator")).toHaveCount(1);
  const access = (await accessLayerItem(page).boundingBox())!;
  const trails = (await overlayItem(page, "hiking-trails").boundingBox())!;
  expect(trails.y).toBeGreaterThan(access.y + access.height - 1);
  // A finger-sized touch target.
  expect(trails.height).toBeGreaterThanOrEqual(44);
  expect(network.blocked).toEqual([]);
});

/** The z-index of the pane an element is drawn in. */
const paneZIndex = (page: Page, selector: string) =>
  mapRegion(page)
    .locator(selector)
    .first()
    .evaluate((element) => Number(getComputedStyle(element.closest(".leaflet-pane")!).zIndex));

test("switching Hiking trails on draws them under the trip, and they stay on after a reload", async ({ page }) => {
  const trip: Trip = {
    name: "Ourthe",
    points: [
      { lat: 50.3, lng: 5.6 },
      { lat: 50.35, lng: 5.65 },
    ],
    legs: [{ mode: "hike" }],
  };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  const network = await openPhone(page);
  await toggleOverlay(page, "hiking-trails");
  await expect(trailTiles(page).first()).toBeVisible();
  // Above the base map, below the trip's legs, their hit lines and its points.
  const trails = await paneZIndex(page, "img[src*='waymarkedtrails']");
  expect(trails).toBeGreaterThan(await paneZIndex(page, "img[src*='opentopomap']"));
  for (const drawn of [
    ".leaflet-overlay-pane path",
    ".leaflet-trip-leg-hits-pane > *",
    ".leaflet-trip-points-pane > *",
  ])
    expect(trails).toBeLessThan(await paneZIndex(page, drawn));
  expect(network.tiles.some((tile) => tile.source === "hiking-trails")).toBe(true);
  await expect(mapRegion(page).locator(".leaflet-control-attribution")).toContainText("Waymarked Trails");

  await page.reload();
  await expect(trailTiles(page).first()).toBeVisible();
  await mapMenuButton(page).click();
  await expect(overlayItem(page, "hiking-trails")).toHaveAttribute("aria-checked", "true");
  // The access layer still starts off on every load.
  await expect(accessLayerItem(page)).toHaveAttribute("aria-checked", "false");
  expect(network.blocked).toEqual([]);
});
