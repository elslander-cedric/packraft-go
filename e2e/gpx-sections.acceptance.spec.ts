// Export GPX downloads one GPX file: one track through the whole trip and a waypoint where
// each section starts, plus one at the end. BRouter is answered from recorded fixtures.
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { downloadGpx } from "./support/gpx";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  dayCards,
  exportGpxDisabled,
  freeMapBox,
  openPlanner,
  pickNextMode,
  renameTrip,
  showTab,
  startGpxExport,
} from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
/** The Days tab's cards; shows the tab first. */
const dayRows = async (page: Page) => {
  await showTab(page, strings.planner.tabs.days);
  return dayCards(page);
};
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
// Updated for ADR 0034: Export GPX is in the menu and asks for the name first.
const exportButton = (page: Page) => () => startGpxExport(page);

const TRAIL: BRouterReply = {
  status: 200,
  body: brouterFixture("hiking-success.geojson"),
};
const RIVER: BRouterReply = {
  status: 200,
  body: brouterFixture("river-success.geojson"),
};
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

const OFFSETS = [-240, -120, 0, 120, 240];

/**
 * Draws points at OFFSETS[0..count) along the map's middle, the legs listed in `paddle`
 * as paddle legs, the rest as hike legs; returns their screen positions.
 */
async function draw(page: Page, count: number, paddle: number[] = []) {
  await openPlanner(page);
  const box = await freeMapBox(page);
  const at = OFFSETS.slice(0, count).map((dx) => ({
    x: box.x + box.width / 2 + dx,
    y: box.y + box.height / 2,
  }));
  for (const [i, p] of at.entries()) {
    if (i > 0) {
      await pickNextMode(page, paddle.includes(i - 1) ? "paddle" : "hike");
    }
    await page.mouse.click(p.x, p.y);
  }
  await expect(legLines(page)).toHaveCount(count - 1);
  return at;
}

async function camp(page: Page, point: { x: number; y: number }) {
  // A click on the spot just drawn, within 0.4 s, would be a double tap.
  await page.waitForTimeout(450);
  await page.mouse.click(point.x, point.y);
  await expect(campButton(page)).toBeEnabled();
  await campButton(page).click();
}

const waypointNames = (text: string) => parseGpx11(text).waypoints.map((w) => w.name);

test("Portage trip (paddle, hike, paddle) exports one single-track GPX with three section waypoints", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  await draw(page, 4, [0, 2]);
  await renameTrip(page, "Lesse");
  for (const leg of [0, 1, 2]) {
    await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);
  }
  const before = network.brouter.length;

  const file = await downloadGpx(page, exportButton(page));

  expect(file.name).toBe("Lesse.gpx");
  const gpx = parseGpx11(file.text);
  expect(gpx.tracks).toHaveLength(1);
  expect(file.text.match(/<trk>/g)).toHaveLength(1);
  expect(file.text.match(/<trkseg>/g)).toHaveLength(1);
  expect(gpx.metadataName).toBe("Lesse");
  expect(gpx.tracks[0].name).toBe("Lesse");
  expect(waypointNames(file.text)).toEqual(["1 – paddle", "2 – hike", "3 – paddle", "End"]);
  expect(network.brouter).toHaveLength(before);
  expect(network.blocked).toEqual([]);
});

test("camp at a mode change and a camp at the end: day numbers match the days panel", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const at = await draw(page, 4, [2]);
  await renameTrip(page, "Ourthe");
  for (const leg of [0, 1, 2]) {
    await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);
  }
  await camp(page, at[2]); // at the put-in
  await camp(page, at[3]); // at the end point: adds no day
  await expect(await dayRows(page)).toHaveCount(2);

  const file = await downloadGpx(page, exportButton(page));

  // Updated: ADR 0037. The day is in the section waypoints' names.
  expect(waypointNames(file.text)).toEqual(["1 – Day 1 – hike", "2 – Day 2 – paddle", "End"]);
});

test("A camp in the middle of a paddle run starts a section on the next day", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const at = await draw(page, 3, [0, 1]);
  await camp(page, at[1]);
  await expect(await dayRows(page)).toHaveCount(2);

  const file = await downloadGpx(page, exportButton(page));

  expect(file.name).toBe(`${strings.tripNamePlaceholder}.gpx`);
  expect(waypointNames(file.text)).toEqual(["1 – Day 1 – paddle", "2 – Day 2 – paddle", "End"]);
  expect(parseGpx11(file.text).tracks).toHaveLength(1);
});

test("A single leg exports one GPX with one track", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await draw(page, 2);
  const file = await downloadGpx(page, exportButton(page));
  expect(parseGpx11(file.text).tracks).toHaveLength(1);
  expect(waypointNames(file.text)).toEqual(["1 – hike", "End"]);
});

test("Repeated exports give the same GPX file", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await draw(page, 3, [1]);
  for (const leg of [0, 1]) {
    await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);
  }
  const first = await downloadGpx(page, exportButton(page));
  const second = await downloadGpx(page, exportButton(page));
  expect(second).toEqual(first);
});

test("A name with characters illegal in file names gives a safe file name", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await draw(page, 3, [1]);
  await renameTrip(page, "Lesse / Ourthe");

  const file = await downloadGpx(page, exportButton(page));

  expect(file.name).toBe("Lesse - Ourthe.gpx");
  expect(parseGpx11(file.text).metadataName).toBe("Lesse / Ourthe");
});

test("Export stays disabled until there is a leg", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  // Updated for ADR 0034: Export GPX is a menu item, disabled while there is no leg.
  expect(await exportGpxDisabled(page)).toBe(true);
  const box = await freeMapBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await exportGpxDisabled(page)).toBe(true);
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
  expect(await exportGpxDisabled(page)).toBe(false);
});
