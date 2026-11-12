// Export GPX: the download is valid GPX 1.1 and exporting calls no service.
// BRouter and tiles are answered from recorded fixtures; no live service is called. Every request is counted.
import { DOMParser } from "@xmldom/xmldom";
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { downloadGpx } from "./support/gpx";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  exportGpxDisabled,
  legRows as rows,
  mapClicker,
  menuItem,
  openPlanner,
  openTripFile,
  renameTrip,
  startGpxExport,
  showAllLegs,
} from "./support/planner";

const KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const campBtn = (page: Page) => page.getByRole("button", { name: strings.campButton });

const TRAIL_TEXT = brouterFixture("hiking-success.geojson");
const RIVER_TEXT = brouterFixture("river-success.geojson");
const TRAIL: BRouterReply = { status: 200, body: TRAIL_TEXT };
const RIVER: BRouterReply = { status: 200, body: RIVER_TEXT };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);
const recorded = (geojson: string) =>
  (JSON.parse(geojson).features[0].geometry.coordinates as number[][]).map(([lng, lat, ele]) => ({ lat, lng, ele }));

type StoredTrip = { name: string; points: { lat: number; lng: number }[]; camps?: number[] };
const storedTrip = async (page: Page): Promise<StoredTrip> =>
  JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY)) ?? "{}").trip;

async function openMap(page: Page) {
  await openPlanner(page);
  return mapClicker(page);
}

// Updated: ADR 0021 (#41). Export downloads a ZIP with one GPX file per section.
// Updated for ADR 0034: Export GPX is in the menu and asks for the name first.
// Updated: ADR 0037. Export downloads one GPX file: one track, a waypoint per section.
const exportGpx = (page: Page) => downloadGpx(page, () => startGpxExport(page));

/** Strict XML parse: throws on any well-formedness error. */
function strictXml(text: string) {
  return new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(message);
    },
  }).parseFromString(text, "application/xml");
}

async function openSave(page: Page, trip: object) {
  // Updated: format reset (#52). Opened files are version 1.
  const text = JSON.stringify({ format: "packraft-go-trip", version: 1, trip });
  await openTripFile(page, { name: "t.packraft.json", mimeType: "application/json", buffer: Buffer.from(text, "utf8") });
}

test.beforeEach(({ page }) => showAllLegs(page));

test("hike + paddle legs and a camp export as GPX 1.1 with routed elevations, named after the trip", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  const name = `Lesse & Lomme <"été"> 'n' co`;
  await renameTrip(page, name);
  await click(-150, 0);
  await click(0, 0);
  await click(150, 0, "paddle");
  await expect(legLines(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toHaveClass(/planner-row-paddle/);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await click(0, 0); // select the middle point
  await campBtn(page).click();
  await expect.poll(async () => (await storedTrip(page)).camps).toEqual([1]);
  const calls = net.brouter.length;

  const file = await exportGpx(page);

  // Updated: ADR 0037. One GPX file named after the trip, made safe: no characters
  // that Windows/macOS/Linux reject.
  expect(file.name).toMatch(/\.gpx$/);
  expect(file.name).not.toMatch(/[/\\:*?"<>|]/);
  expect(file.name).toContain("Lesse & Lomme");
  expect(file.name).toContain("été");

  // Well-formed, GPX 1.1 structure, name round-trips exactly through a strict parser.
  const doc = strictXml(file.text);
  expect(doc.documentElement!.getAttribute("version")).toBe("1.1");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe(name);
  expect(gpx.tracks.map((t) => t.name)).toEqual([name]);
  // Updated: ADR 0037. One track through both legs, the point where they meet written once.
  const expected = [...recorded(TRAIL_TEXT), ...recorded(RIVER_TEXT).slice(1)];
  expect(gpx.tracks[0].points).toHaveLength(expected.length);
  gpx.tracks[0].points.forEach((p, j) => {
    expect(p.lat).toBeCloseTo(expected[j].lat, 6);
    expect(p.lon).toBeCloseTo(expected[j].lng, 6);
    expect(p.ele).toBeCloseTo(expected[j].ele, 1);
  });
  // Updated: ADR 0037. The camp starts the paddle section, so its waypoint names the day.
  expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – Day 1 – hike", "2 – Day 2 – paddle", "End"]);

  // Exporting calls no routing and no other service.
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(calls);
  expect(net.blocked).toEqual([]);
});

test("an unnamed trip with unrouted legs exports straight lines at the drawn points, without elevation", async ({ page }) => {
  const net = await serveOffline(page); // BRouter unavailable
  const click = await openMap(page);
  await click(-100, 20);
  await click(50, -30);
  await click(120, 40);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-failed/);
  const stored = await storedTrip(page);

  // Updated: ADR 0037. Two hike legs are one section: one track through the three drawn points.
  const file = await exportGpx(page);
  expect(file.name).toBe("Untitled trip.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe("Untitled trip");
  expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – hike", "End"]);
  expect(gpx.tracks.map((t) => t.name)).toEqual(["Untitled trip"]);
  expect(gpx.tracks[0].points).toHaveLength(3);
  for (const [i, p] of gpx.tracks[0].points.entries()) {
    expect(p.ele).toBeUndefined();
    expect(p.lat).toBeCloseTo(stored.points[i].lat, 6);
    expect(p.lon).toBeCloseTo(stored.points[i].lng, 6);
  }
  expect(net.blocked).toEqual([]);
});

test("Export GPX is disabled until the trip has a leg, and again when it has none", async ({ page }) => {
  await serveOffline(page);
  const click = await openMap(page);
  expect(await exportGpxDisabled(page)).toBe(true);
  await click(-80, 0);
  await expect(pointMarkers(page)).toHaveCount(1);
  expect(await exportGpxDisabled(page)).toBe(true);
  await click(80, 0);
  await expect(legLines(page)).toHaveCount(1);
  expect(await exportGpxDisabled(page)).toBe(false);
  await undoBtn(page).click();
  await expect(legLines(page)).toHaveCount(0);
  expect(await exportGpxDisabled(page)).toBe(true);
  await click(80, 0);
  expect(await exportGpxDisabled(page)).toBe(false);
  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.planner.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(pointMarkers(page)).toHaveCount(0);
  expect(await exportGpxDisabled(page)).toBe(true);
  // A disabled item downloads nothing and asks nothing.
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  await page.getByRole("button", { name: strings.planner.menu.button }).click();
  await page.getByRole("menuitem", { name: strings.planner.menu.exportGpx }).click({ force: true });
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
  await expect(page.getByRole("dialog", { name: strings.planner.menu.exportTitle })).toHaveCount(0);
});

test("the export reflects a reloaded trip and renaming, without re-routing", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  await click(-100, 0);
  await click(100, 0);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await page.reload();
  await expect(legLines(page)).toHaveCount(1);
  const calls = net.brouter.length;
  await renameTrip(page, "Semois day");
  // Updated: ADR 0037. One GPX file named after the trip.
  const file = await exportGpx(page);
  expect(file.name).toBe("Semois day.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe("Semois day");
  expect(gpx.tracks[0].points.length).toBe(recorded(TRAIL_TEXT).length);
  expect(gpx.tracks[0].points.every((p) => typeof p.ele === "number")).toBe(true);
  expect(net.brouter).toHaveLength(calls);
});

test("a trip name with a control character (from an opened file) still exports well-formed XML", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);
  await openSave(page, {
    name: "Bell\u0007 trip",
    points: [
      { lat: 50.3, lng: 5.6 },
      { lat: 50.31, lng: 5.61 },
    ],
    legs: [{ mode: "hike" }],
  });
  await expect(legLines(page)).toHaveCount(1);
  // Updated: ADR 0037. One GPX file.
  const file = await exportGpx(page);
  expect(file.name).not.toMatch(/[\u0000-\u001F]/);
  expect(() => parseGpx11(file.text)).not.toThrow();
  // XML 1.0 forbids these characters even when escaped; xmldom is lenient, so check directly.
  expect(file.text).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
});

test("a point at the antimeridian (from an opened file) exports a longitude GPX 1.1 accepts", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);
  await openSave(page, {
    name: "Edge",
    points: [
      { lat: 10, lng: 179.99999999 },
      { lat: 10.1, lng: 180 },
    ],
    legs: [{ mode: "hike" }],
  });
  await expect(pointMarkers(page)).toHaveCount(2);
  // Updated: ADR 0037. One GPX file: two track points and two waypoints (the start and the end).
  const file = await exportGpx(page);
  const lons = [...file.text.matchAll(/lon="([^"]+)"/g)].map((m) => Number(m[1]));
  expect(lons).toHaveLength(4);
  // GPX 1.1 longitudeType: -180 <= lon < 180.
  for (const lon of lons) expect(lon >= -180 && lon < 180).toBe(true);
});
