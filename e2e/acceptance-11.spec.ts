// Acceptance tests for #11 (export as GPX), written by the tester from the issue,
// spec #2 (stories 39, 45-47) and ADR 0006. BRouter and tiles are answered from
// recorded fixtures (ADR 0019); every request is counted so export can be shown
// to call nothing.
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const rows = (page: Page) => panel(page).getByRole("listitem");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const exportBtn = (page: Page) => page.getByRole("button", { name: "Export GPX" });
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const newTripBtn = (page: Page) => page.getByRole("button", { name: strings.newTripButton });
const openBtn = (page: Page) => page.getByRole("button", { name: strings.openFileButton });
const campBtn = (page: Page) => page.getByRole("button", { name: strings.campButton });
const modeButton = (page: Page, leg: number, mode: string) =>
  rows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name: mode });

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
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

async function exportGpx(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), exportBtn(page).click()]);
  return { name: dl.suggestedFilename(), text: await readFile((await dl.path())!, "utf8") };
}

/** Strict XML parse: throws on any well-formedness error. */
function strictXml(text: string) {
  return new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(message);
    },
  }).parseFromString(text, "application/xml");
}

async function openSave(page: Page, trip: object) {
  const text = JSON.stringify({ format: "packraft-go-trip", version: 2, trip });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), openBtn(page).click()]);
  await chooser.setFiles({ name: "t.packraft.json", mimeType: "application/json", buffer: Buffer.from(text, "utf8") });
}

test("#11: hike + paddle legs and a camp export as GPX 1.1 with routed elevations, named after the trip", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  const name = `Lesse & Lomme <"été"> 'n' co`;
  await tripName(page).fill(name);
  await click(-150, 0);
  await click(0, 0);
  await click(150, 0);
  await expect(legLines(page)).toHaveCount(2);
  await modeButton(page, 1, strings.legModePaddle).click();
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await click(0, 0); // select the middle point
  await campBtn(page).click();
  await expect.poll(async () => (await storedTrip(page)).camps).toEqual([1]);
  const stored = await storedTrip(page);
  const calls = net.brouter.length;

  const file = await exportGpx(page);

  // File name is the trip name made safe: no characters that Windows/macOS/Linux reject.
  expect(file.name.endsWith(".gpx")).toBe(true);
  expect(file.name).not.toMatch(/[/\\:*?"<>|]/);
  expect(file.name).toContain("Lesse & Lomme");
  expect(file.name).toContain("été");

  // Well-formed, GPX 1.1 structure, name round-trips exactly through a strict parser.
  const doc = strictXml(file.text);
  expect(doc.documentElement!.getAttribute("version")).toBe("1.1");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe(name);

  expect(gpx.tracks.map((t) => t.name)).toEqual(["Leg 1 – hike", "Leg 2 – paddle"]);
  for (const [i, fixture] of [TRAIL_TEXT, RIVER_TEXT].entries()) {
    const expected = recorded(fixture);
    expect(gpx.tracks[i].points).toHaveLength(expected.length);
    gpx.tracks[i].points.forEach((p, j) => {
      expect(p.lat).toBeCloseTo(expected[j].lat, 6);
      expect(p.lon).toBeCloseTo(expected[j].lng, 6);
      expect(p.ele).toBeCloseTo(expected[j].ele, 1);
    });
  }

  // The camp is a waypoint at the camp point itself.
  expect(gpx.waypoints).toHaveLength(1);
  expect(gpx.waypoints[0].name).toBe("Camp 1");
  expect(gpx.waypoints[0].lat).toBeCloseTo(stored.points[1].lat, 6);
  expect(gpx.waypoints[0].lon).toBeCloseTo(stored.points[1].lng, 6);

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

  const file = await exportGpx(page);
  expect(file.name).toBe("Untitled trip.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe("Untitled trip");
  expect(gpx.waypoints).toEqual([]);
  expect(gpx.tracks.map((t) => t.name)).toEqual(["Leg 1 – hike", "Leg 2 – hike"]);
  for (const [i, track] of gpx.tracks.entries()) {
    expect(track.points).toHaveLength(2);
    for (const [j, p] of track.points.entries()) {
      expect(p.ele).toBeUndefined();
      expect(p.lat).toBeCloseTo(stored.points[i + j].lat, 6);
      expect(p.lon).toBeCloseTo(stored.points[i + j].lng, 6);
    }
  }
  expect(net.blocked).toEqual([]);
});

test("#11: Export GPX is disabled until the trip has a leg, and again when it has none", async ({ page }) => {
  await serveOffline(page);
  const click = await openMap(page);
  await expect(exportBtn(page)).toBeDisabled();
  await click(-80, 0);
  await expect(pointMarkers(page)).toHaveCount(1);
  await expect(exportBtn(page)).toBeDisabled();
  await click(80, 0);
  await expect(legLines(page)).toHaveCount(1);
  await expect(exportBtn(page)).toBeEnabled();
  await undoBtn(page).click();
  await expect(legLines(page)).toHaveCount(0);
  await expect(exportBtn(page)).toBeDisabled();
  await click(80, 0);
  await expect(exportBtn(page)).toBeEnabled();
  page.once("dialog", (d) => void d.accept());
  await newTripBtn(page).click();
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(exportBtn(page)).toBeDisabled();
  // A disabled button downloads nothing.
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  await exportBtn(page).click({ force: true });
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
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
  await tripName(page).fill("Semois day");
  const file = await exportGpx(page);
  expect(file.name).toBe("Semois day.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.metadataName).toBe("Semois day");
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
  const file = await exportGpx(page);
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
  const file = await exportGpx(page);
  const lons = [...file.text.matchAll(/lon="([^"]+)"/g)].map((m) => Number(m[1]));
  expect(lons).toHaveLength(2);
  // GPX 1.1 longitudeType: -180 <= lon < 180.
  for (const lon of lons) expect(lon >= -180 && lon < 180).toBe(true);
});
