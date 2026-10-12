// Export as GPX (#11). BRouter is answered from recorded responses; the
// downloaded file is parsed and checked against the GPX 1.1 structure.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
const exportButton = (page: Page) => page.getByRole("button", { name: strings.exportGpxButton });

const TRAIL_FILE = brouterFixture("hiking-success.geojson");
const RIVER_FILE = brouterFixture("river-success.geojson");
const TRAIL: BRouterReply = { status: 200, body: TRAIL_FILE };
const RIVER: BRouterReply = { status: 200, body: RIVER_FILE };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

/** The recorded route's points as GPX track points: [lon, lat, ele] becomes { lat, lon, ele }. */
const recordedTrack = (geojson: string) =>
  (JSON.parse(geojson).features[0].geometry.coordinates as number[][]).map(([lon, lat, ele]) => ({ lat, lon, ele }));

/** Opens the app and clicks three points across the map; returns the middle point's position on screen. */
async function drawThreePoints(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const dx of [-150, 0, 150]) await page.mouse.click(middle.x + dx, middle.y);
  await expect(legLines(page)).toHaveCount(2);
  return middle;
}

async function exportGpx(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton(page).click()]);
  return { name: download.suggestedFilename(), text: await readFile((await download.path())!, "utf8") };
}

test("exports a hike leg, a paddle leg and a camp as a GPX 1.1 file named after the trip", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawThreePoints(page);
  await tripName(page).fill("Ourthe weekend");
  await legRows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await page.mouse.click(middle.x, middle.y); // select the middle point
  await campButton(page).click();

  const requestsBefore = network.brouter.length;
  const file = await exportGpx(page);

  expect(file.name).toBe("Ourthe weekend.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe("Ourthe weekend");
  expect(gpx.tracks.map((track) => track.name)).toEqual(["Leg 1 – hike", "Leg 2 – paddle"]);
  expect(gpx.tracks[0].points).toEqual(recordedTrack(TRAIL_FILE));
  expect(gpx.tracks[1].points).toEqual(recordedTrack(RIVER_FILE));
  expect(gpx.waypoints).toHaveLength(1);
  expect(gpx.waypoints[0]).toMatchObject({ name: "Camp 1", ele: expect.any(Number) });
  // Exporting routes nothing and calls no other service.
  expect(network.brouter).toHaveLength(requestsBefore);
  expect(network.blocked).toEqual([]);
});

test("an unnamed trip whose legs could not be routed exports straight lines without elevation", async ({ page }) => {
  await serveOffline(page); // BRouter unavailable
  await drawThreePoints(page);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-failed/);

  const file = await exportGpx(page);

  expect(file.name).toBe(`${strings.tripNamePlaceholder}.gpx`);
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe(strings.tripNamePlaceholder);
  expect(gpx.tracks.map((track) => track.name)).toEqual(["Leg 1 – hike", "Leg 2 – hike"]);
  for (const track of gpx.tracks) {
    expect(track.points).toHaveLength(2);
    expect(track.points.every((point) => point.ele === undefined)).toBe(true);
  }
  // The legs join up: each starts where the one before ended.
  expect(gpx.tracks[1].points[0]).toEqual(gpx.tracks[0].points[1]);
  expect(gpx.waypoints).toEqual([]);
});

test("export is unavailable until the trip has a leg", async ({ page }) => {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(exportButton(page)).toBeDisabled();
  const box = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(exportButton(page)).toBeDisabled();
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
  await expect(exportButton(page)).toBeEnabled();
});
