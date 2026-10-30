// The base map on the phone (#179, ADR 0031): the layers button under the position button opens
// the Map menu, the three base maps and then the access layer's switch. The choice is the same
// setting on every screen. Every tile comes from the fixture; no live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { accessLayerItem, baseMapItem, chooseBaseMap, mapMenuButton } from "./support/mapMenu";
import { serveOffline, tileSourceOf } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const attribution = (page: Page) => mapRegion(page).locator(".leaflet-control-attribution");

/** The sources of the tiles drawn on the map, sorted. */
async function drawnSources(page: Page) {
  const sources = await mapRegion(page)
    .locator(".leaflet-tile-pane img")
    .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
  return [...new Set(sources.map(tileSourceOf))].sort();
}

async function openPhone(page: Page) {
  const network = await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  return network;
}

test("the Map menu lists the base maps, the current one marked, then the access layer switch", async ({ page }) => {
  const network = await openPhone(page);
  await mapMenuButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    strings.baseMaps.opentopomap,
    strings.baseMaps["aerial-be"],
    strings.baseMaps["ngi-topo"],
  ]);
  await expect(baseMapItem(page, "opentopomap")).toHaveAttribute("aria-checked", "true");
  await expect(accessLayerItem(page)).toHaveAttribute("aria-checked", "false");
  // The switch comes after the base maps, below a divider.
  const lastBaseMap = (await baseMapItem(page, "ngi-topo").boundingBox())!;
  const access = (await accessLayerItem(page).boundingBox())!;
  expect(access.y).toBeGreaterThan(lastBaseMap.y + lastBaseMap.height - 1);
  await expect(menu.getByRole("separator")).toHaveCount(1);
  // Each row is a finger-sized touch target.
  expect(access.height).toBeGreaterThanOrEqual(44);
  expect(network.blocked).toEqual([]);
});

test("choosing a base map in the Map menu loads it, and the choice survives a reload", async ({ page }) => {
  const network = await openPhone(page);

  await chooseBaseMap(page, "aerial-be");
  await expect.poll(() => drawnSources(page)).toEqual(["brussels", "flanders", "opentopomap", "wallonia"]);
  await expect(attribution(page)).toContainText("Digitaal Vlaanderen");

  await page.reload();
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect.poll(() => drawnSources(page)).toEqual(["brussels", "flanders", "opentopomap", "wallonia"]);
  await mapMenuButton(page).click();
  await expect(baseMapItem(page, "aerial-be")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  await chooseBaseMap(page, "ngi-topo");
  await expect.poll(() => drawnSources(page)).toEqual(["ngi", "opentopomap"]);
  await expect(attribution(page)).toContainText("NGI/IGN");
  await expect(attribution(page)).not.toContainText("Digitaal Vlaanderen");
  expect(network.tiles.some((tile) => tile.source === "ngi")).toBe(true);
  expect(network.blocked).toEqual([]);
});
