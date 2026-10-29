// Acceptance tests for #11 (export as GPX) written from the issue,
// spec #2 (stories 39, 45-47) and ADR 0006. BRouter and tiles are answered from
// recorded fixtures (ADR 0019); every request is counted so export can be shown
// to call nothing.
import { DOMParser } from "@xmldom/xmldom";
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { downloadGpxZip } from "./support/gpxZip";
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
const exportGpx = (page: Page) => downloadGpxZip(page, () => startGpxExport(page));

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

test("#11: hike + paddle legs and a camp export as GPX 1.1 with routed elevations, named after the trip", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  const name = `Lesse & Lomme <"été"> 'n' co`;
  await renameTrip(page, name);
  await click(-150, 0);
  await click(0, 0);
  await click(150, 0, "paddle");
  await expect(legLines(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toHaveClass(/phone-row-paddle/);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await click(0, 0); // select the middle point
  await campBtn(page).click();
  await expect.poll(async () => (await storedTrip(page)).camps).toEqual([1]);
  const calls = net.brouter.length;

  const zip = await exportGpx(page);

  // Updated: ADR 0021. A ZIP named after the trip, one GPX file per section.
  // File names are the trip name made safe: no characters that Windows/macOS/Linux reject.
  for (const fileName of [zip.name, ...zip.files.map((f) => f.name)]) {
    expect(fileName).toMatch(/\.(zip|gpx)$/);
    expect(fileName).not.toMatch(/[/\\:*?"<>|]/);
    expect(fileName).toContain("Lesse & Lomme");
    expect(fileName).toContain("été");
  }
  expect(zip.name.endsWith(".zip")).toBe(true);
  expect(zip.files).toHaveLength(2);

  // Updated: ADR 0021. The camp ends the hike section, so each file names its day.
  const sectionNames = [`${name} – 1 – Day 1 – hike`, `${name} – 2 – Day 2 – paddle`];
  for (const [i, fixture] of [TRAIL_TEXT, RIVER_TEXT].entries()) {
    // Well-formed, GPX 1.1 structure, name round-trips exactly through a strict parser.
    const doc = strictXml(zip.files[i].text);
    expect(doc.documentElement!.getAttribute("version")).toBe("1.1");
    const gpx = parseGpx11(zip.files[i].text);
    expect(gpx.metadataName).toBe(sectionNames[i]);
    expect(gpx.tracks.map((t) => t.name)).toEqual([sectionNames[i]]);
    const expected = recorded(fixture);
    expect(gpx.tracks[0].points).toHaveLength(expected.length);
    gpx.tracks[0].points.forEach((p, j) => {
      expect(p.lat).toBeCloseTo(expected[j].lat, 6);
      expect(p.lon).toBeCloseTo(expected[j].lng, 6);
      expect(p.ele).toBeCloseTo(expected[j].ele, 1);
    });
    // Updated: ADR 0021. Camps are no longer exported as waypoints.
    expect(gpx.waypoints).toEqual([]);
  }

  // Exporting calls no routing and no other service.
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(calls);
  expect(net.blocked).toEqual([]);
});

test("#11: an unnamed trip with unrouted legs exports straight lines at the drawn points, without elevation", async ({ page }) => {
  const net = await serveOffline(page); // BRouter unavailable
  const click = await openMap(page);
  await click(-100, 20);
  await click(50, -30);
  await click(120, 40);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-failed/);
  const stored = await storedTrip(page);

  // Updated: ADR 0021. Two hike legs are one section: one file, one track through the three drawn points.
  const zip = await exportGpx(page);
  expect(zip.name).toBe("Untitled trip.zip");
  expect(zip.files.map((f) => f.name)).toEqual(["Untitled trip – 1 – hike.gpx"]);
  const gpx = parseGpx11(zip.files[0].text);
  expect(gpx.metadataName).toBe("Untitled trip – 1 – hike");
  expect(gpx.waypoints).toEqual([]);
  expect(gpx.tracks.map((t) => t.name)).toEqual(["Untitled trip – 1 – hike"]);
  expect(gpx.tracks[0].points).toHaveLength(3);
  for (const [i, p] of gpx.tracks[0].points.entries()) {
    expect(p.ele).toBeUndefined();
    expect(p.lat).toBeCloseTo(stored.points[i].lat, 6);
    expect(p.lon).toBeCloseTo(stored.points[i].lng, 6);
  }
  expect(net.blocked).toEqual([]);
});

test("#11: Export GPX is disabled until the trip has a leg, and again when it has none", async ({ page }) => {
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
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(pointMarkers(page)).toHaveCount(0);
  expect(await exportGpxDisabled(page)).toBe(true);
  // A disabled item downloads nothing and asks nothing.
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  await page.getByRole("button", { name: strings.phone.menu.button }).click();
  await page.getByRole("menuitem", { name: strings.phone.menu.exportGpx }).click({ force: true });
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
  await expect(page.getByRole("dialog", { name: strings.phone.menu.exportTitle })).toHaveCount(0);
});

test("#11: the export reflects a reloaded trip and renaming, without re-routing", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  await click(-100, 0);
  await click(100, 0);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await page.reload();
  await expect(legLines(page)).toHaveCount(1);
  const calls = net.brouter.length;
  await renameTrip(page, "Semois day");
  // Updated: ADR 0021. A ZIP named after the trip with one file for the one section.
  const zip = await exportGpx(page);
  expect(zip.name).toBe("Semois day.zip");
  expect(zip.files.map((f) => f.name)).toEqual(["Semois day – 1 – hike.gpx"]);
  const gpx = parseGpx11(zip.files[0].text);
  expect(gpx.metadataName).toBe("Semois day – 1 – hike");
  expect(gpx.tracks[0].points.length).toBe(recorded(TRAIL_TEXT).length);
  expect(gpx.tracks[0].points.every((p) => typeof p.ele === "number")).toBe(true);
  expect(net.brouter).toHaveLength(calls);
});

test("#11: a trip name with a control character (from an opened file) still exports well-formed XML", async ({ page }) => {
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
  // Updated: ADR 0021. The GPX file comes inside the ZIP.
  const zip = await exportGpx(page);
  expect(zip.files).toHaveLength(1);
  const [file] = zip.files;
  expect(file.name).not.toMatch(/[\u0000-\u001F]/);
  expect(() => parseGpx11(file.text)).not.toThrow();
  // XML 1.0 forbids these characters even when escaped; xmldom is lenient, so check directly.
  expect(file.text).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
});

test("#11: a point at the antimeridian (from an opened file) exports a longitude GPX 1.1 accepts", async ({ page }) => {
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
  // Updated: ADR 0021. The GPX file comes inside the ZIP.
  const [file] = (await exportGpx(page)).files;
  const lons = [...file.text.matchAll(/lon="([^"]+)"/g)].map((m) => Number(m[1]));
  expect(lons).toHaveLength(2);
  // GPX 1.1 longitudeType: -180 <= lon < 180.
  for (const lon of lons) expect(lon >= -180 && lon < 180).toBe(true);
});
