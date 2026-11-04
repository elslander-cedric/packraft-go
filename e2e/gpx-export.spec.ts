// Export as GPX (#11, #41; one file with one track and a waypoint per section,
// ADR 0037). BRouter is answered from recorded responses; the downloaded GPX file
// is checked against the GPX 1.1 structure.
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { downloadGpx } from "./support/gpx";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { exportGpxDisabled, freeMapBox, openPlanner, pickNextMode, renameTrip, startGpxExport } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
// Updated for ADR 0034: Export GPX is in the menu and asks for the name first.
const exportButton = (page: Page) => () => startGpxExport(page);

const TRAIL_FILE = brouterFixture("hiking-success.geojson");
const RIVER_FILE = brouterFixture("river-success.geojson");
const TRAIL: BRouterReply = { status: 200, body: TRAIL_FILE };
const RIVER: BRouterReply = { status: 200, body: RIVER_FILE };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

/** The recorded route's points as GPX track points: [lon, lat, ele] becomes { lat, lon, ele }. */
const recordedTrack = (geojson: string) =>
  (JSON.parse(geojson).features[0].geometry.coordinates as number[][]).map(([lon, lat, ele]) => ({ lat, lon, ele }));

/**
 * Opens the app and clicks points across the map at the given offsets, the legs listed in
 * `paddle` drawn as paddle legs; returns the map's middle on screen.
 */
async function drawPoints(page: Page, offsets: number[], paddle: number[] = []) {
  await openPlanner(page);
  const box = (await freeMapBox(page));
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const [i, dx] of offsets.entries()) {
    if (i > 0) await pickNextMode(page, paddle.includes(i - 1) ? "paddle" : "hike");
    await page.mouse.click(middle.x + dx, middle.y);
  }
  await expect(legLines(page)).toHaveCount(offsets.length - 1);
  return middle;
}

test("exports a hike leg, a paddle leg and a camp as one GPX 1.1 track with a waypoint per section, named after the trip", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawPoints(page, [-150, 0, 150], [1]);
  await renameTrip(page, "Ourthe weekend");
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await page.mouse.click(middle.x, middle.y); // select the middle point
  await campButton(page).click();

  const requestsBefore = network.brouter.length;
  const file = await downloadGpx(page, exportButton(page));

  expect(file.name).toBe("Ourthe weekend.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.tracks).toHaveLength(1);
  expect(file.text.match(/<trkseg>/g)).toHaveLength(1);
  expect(gpx.metadataName).toBe("Ourthe weekend");
  expect(gpx.tracks[0].name).toBe("Ourthe weekend");
  const hike = recordedTrack(TRAIL_FILE);
  const paddle = recordedTrack(RIVER_FILE);
  expect(gpx.tracks[0].points).toEqual([...hike, ...paddle.slice(1)]);
  // Each section's waypoint is where it starts on the track; the last is the end.
  expect(gpx.waypoints).toEqual([
    { ...hike[0], name: "1 – Day 1 – hike" },
    { ...hike.at(-1)!, name: "2 – Day 2 – paddle" },
    { ...paddle.at(-1)!, name: "End" },
  ]);
  // Exporting routes nothing and calls no other service.
  expect(network.brouter).toHaveLength(requestsBefore);
  expect(network.blocked).toEqual([]);
});

test("joins consecutive paddle legs into one section without repeating the point where they meet", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawPoints(page, [-200, -70, 70, 200], [1, 2]);
  for (const leg of [0, 1, 2]) await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);

  const file = await downloadGpx(page, exportButton(page));

  const gpx = parseGpx11(file.text);
  expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – hike", "2 – paddle", "End"]);
  const trail = recordedTrack(TRAIL_FILE);
  const river = recordedTrack(RIVER_FILE);
  expect(gpx.tracks[0].points).toEqual([...trail, ...river.slice(1), ...river.slice(1)]);
});

test("an unnamed trip whose legs could not be routed exports straight lines without elevation", async ({ page }) => {
  await serveOffline(page); // BRouter unavailable
  await drawPoints(page, [-150, 0, 150]);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-failed/);

  const file = await downloadGpx(page, exportButton(page));

  expect(file.name).toBe(`${strings.tripNamePlaceholder}.gpx`);
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe(strings.tripNamePlaceholder);
  // Both hike legs form one section: three points, the shared one written once.
  expect(gpx.tracks).toHaveLength(1);
  expect(gpx.tracks[0].points).toHaveLength(3);
  expect(gpx.tracks[0].points.every((point) => point.ele === undefined)).toBe(true);
  expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – hike", "End"]);
});

test("export is unavailable until the trip has a leg", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  expect(await exportGpxDisabled(page)).toBe(true);
  const box = (await freeMapBox(page));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await exportGpxDisabled(page)).toBe(true);
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
  expect(await exportGpxDisabled(page)).toBe(false);
});
