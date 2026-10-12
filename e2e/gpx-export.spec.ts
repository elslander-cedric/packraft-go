// Export as GPX (#11; one file per section in a ZIP since #41, ADR 0021). BRouter
// is answered from recorded responses; the downloaded ZIP is unzipped and each
// GPX file is checked against the GPX 1.1 structure.
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { downloadGpxZip } from "./support/gpxZip";
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

/** Opens the app and clicks points across the map at the given offsets; returns the map's middle on screen. */
async function drawPoints(page: Page, offsets: number[]) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const dx of offsets) await page.mouse.click(middle.x + dx, middle.y);
  await expect(legLines(page)).toHaveCount(offsets.length - 1);
  return middle;
}

const setPaddle = (page: Page, leg: number) =>
  legRows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();

test("exports a hike leg, a paddle leg and a camp as a ZIP of one GPX 1.1 file per section, named after the trip", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawPoints(page, [-150, 0, 150]);
  await tripName(page).fill("Ourthe weekend");
  await setPaddle(page, 1);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await page.mouse.click(middle.x, middle.y); // select the middle point
  await campButton(page).click();

  const requestsBefore = network.brouter.length;
  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.name).toBe("Ourthe weekend.zip");
  expect(zip.files.map((file) => file.name)).toEqual([
    "Ourthe weekend – 1 – Day 1 – hike.gpx",
    "Ourthe weekend – 2 – Day 2 – paddle.gpx",
  ]);
  const [hike, paddle] = zip.files.map((file) => ({ ...file, gpx: parseGpx11(file.text) }));
  for (const file of [hike, paddle]) {
    expect(file.gpx.tracks).toHaveLength(1);
    expect(file.text.match(/<trkseg>/g)).toHaveLength(1);
    expect(file.gpx.metadataName).toBe(file.name.replace(/\.gpx$/, ""));
    expect(file.gpx.tracks[0].name).toBe(file.name.replace(/\.gpx$/, ""));
    expect(file.gpx.waypoints).toEqual([]);
  }
  expect(hike.gpx.tracks[0].points).toEqual(recordedTrack(TRAIL_FILE));
  expect(paddle.gpx.tracks[0].points).toEqual(recordedTrack(RIVER_FILE));
  // Exporting routes nothing and calls no other service.
  expect(network.brouter).toHaveLength(requestsBefore);
  expect(network.blocked).toEqual([]);
});

test("joins consecutive paddle legs into one file without repeating the point where they meet", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawPoints(page, [-200, -70, 70, 200]);
  await setPaddle(page, 1);
  await setPaddle(page, 2);
  for (const leg of [0, 1, 2]) await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);

  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.files.map((file) => file.name)).toEqual([
    `${strings.tripNamePlaceholder} – 1 – hike.gpx`,
    `${strings.tripNamePlaceholder} – 2 – paddle.gpx`,
  ]);
  const river = recordedTrack(RIVER_FILE);
  expect(parseGpx11(zip.files[1].text).tracks[0].points).toEqual([...river, ...river.slice(1)]);
});

test("an unnamed trip whose legs could not be routed exports straight lines without elevation", async ({ page }) => {
  await serveOffline(page); // BRouter unavailable
  await drawPoints(page, [-150, 0, 150]);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-failed/);

  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.name).toBe(`${strings.tripNamePlaceholder}.zip`);
  expect(zip.files.map((file) => file.name)).toEqual([`${strings.tripNamePlaceholder} – 1 – hike.gpx`]);
  const gpx = parseGpx11(zip.files[0].text);
  expect(gpx.metadataName).toBe(`${strings.tripNamePlaceholder} – 1 – hike`);
  // Both hike legs form one section: three points, the shared one written once.
  expect(gpx.tracks).toHaveLength(1);
  expect(gpx.tracks[0].points).toHaveLength(3);
  expect(gpx.tracks[0].points.every((point) => point.ele === undefined)).toBe(true);
  expect(gpx.waypoints).toEqual([]);
});

test("export is unavailable until the trip has a leg", async ({ page }) => {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(exportButton(page)).toBeDisabled();
  await expect(exportButton(page)).toHaveAccessibleDescription(strings.exportGpxDisabledReason);
  const box = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(exportButton(page)).toBeDisabled();
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
  await expect(exportButton(page)).toBeEnabled();
});
