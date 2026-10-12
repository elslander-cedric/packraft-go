// Acceptance tests for #41 (ADR 0021), written by the tester: Export GPX downloads
// one ZIP holding one GPX file per section. BRouter is answered from recorded
// responses; the ZIP is unzipped in the test.
import { expect, test, type Page } from "@playwright/test";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { downloadGpxZip } from "./support/gpxZip";
import {
  brouterFixture,
  serveOffline,
  type BRouterReply,
} from "./support/offline";

const mapRegion = (page: Page) =>
  page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) =>
  page.getByRole("complementary", { name: strings.legsPanelLabel });
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const dayRows = (page: Page) =>
  page
    .getByRole("complementary", { name: strings.daysPanelLabel })
    .getByRole("listitem");
const legLines = (page: Page) =>
  mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const tripName = (page: Page) =>
  page.getByRole("textbox", { name: strings.tripNameLabel });
const campButton = (page: Page) =>
  page.getByRole("button", { name: strings.campButton });
const exportButton = (page: Page) =>
  page.getByRole("button", { name: strings.exportGpxButton });

const TRAIL: BRouterReply = {
  status: 200,
  body: brouterFixture("hiking-success.geojson"),
};
const RIVER: BRouterReply = {
  status: 200,
  body: brouterFixture("river-success.geojson"),
};
const byProfile = (url: URL) =>
  url.searchParams.get("profile") === "river" ? RIVER : TRAIL;

const OFFSETS = [-240, -120, 0, 120, 240];

/** Draws points at OFFSETS[0..count) along the map's middle; returns their screen positions. */
async function draw(page: Page, count: number) {
  await page.goto("/");
  await expect(
    mapRegion(page).locator("img.leaflet-tile-loaded").first(),
  ).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  const at = OFFSETS.slice(0, count).map((dx) => ({
    x: box.x + box.width / 2 + dx,
    y: box.y + box.height / 2,
  }));
  for (const p of at) await page.mouse.click(p.x, p.y);
  await expect(legLines(page)).toHaveCount(count - 1);
  return at;
}

const setPaddle = (page: Page, leg: number) =>
  legRows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();

async function camp(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y);
  await expect(campButton(page)).toBeEnabled();
  await campButton(page).click();
}

const base = (fileName: string) => fileName.replace(/\.gpx$/, "");

test("portage trip (paddle, hike, paddle) exports a ZIP of three single-track GPX files", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  await draw(page, 4);
  await tripName(page).fill("Lesse");
  await setPaddle(page, 0);
  await setPaddle(page, 2);
  for (const leg of [0, 1, 2])
    await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);
  const before = network.brouter.length;

  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.name).toBe("Lesse.zip");
  expect(zip.files.map((f) => f.name)).toEqual([
    "Lesse – 1 – paddle.gpx",
    "Lesse – 2 – hike.gpx",
    "Lesse – 3 – paddle.gpx",
  ]);
  for (const file of zip.files) {
    const gpx = parseGpx11(file.text);
    expect(gpx.tracks).toHaveLength(1);
    expect(file.text.match(/<trk>/g)).toHaveLength(1);
    expect(file.text.match(/<trkseg>/g)).toHaveLength(1);
    expect(gpx.metadataName).toBe(base(file.name));
    expect(gpx.tracks[0].name).toBe(base(file.name));
  }
  expect(network.brouter).toHaveLength(before);
  expect(network.blocked).toEqual([]);
});

test("camp at a mode change and a camp at the end: day numbers match the days panel", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  const at = await draw(page, 4);
  await tripName(page).fill("Ourthe");
  await setPaddle(page, 2); // hike, hike, paddle
  for (const leg of [0, 1, 2])
    await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);
  await camp(page, at[2]); // at the put-in
  await camp(page, at[3]); // at the end point: adds no day
  await expect(dayRows(page)).toHaveCount(2);

  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.files.map((f) => f.name)).toEqual([
    "Ourthe – 1 – Day 1 – hike.gpx",
    "Ourthe – 2 – Day 2 – paddle.gpx",
  ]);
  for (const file of zip.files)
    expect(parseGpx11(file.text).waypoints).toEqual([]);
});

test("a camp in the middle of a paddle run splits it into two files on consecutive days", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  const at = await draw(page, 3);
  await setPaddle(page, 0);
  await setPaddle(page, 1);
  await camp(page, at[1]);
  await expect(dayRows(page)).toHaveCount(2);

  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.name).toBe(`${strings.tripNamePlaceholder}.zip`);
  expect(zip.files.map((f) => f.name)).toEqual([
    `${strings.tripNamePlaceholder} – 1 – Day 1 – paddle.gpx`,
    `${strings.tripNamePlaceholder} – 2 – Day 2 – paddle.gpx`,
  ]);
});

test("a single leg exports a ZIP with one GPX", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await draw(page, 2);
  const zip = await downloadGpxZip(page, exportButton(page));
  expect(zip.files).toHaveLength(1);
  expect(parseGpx11(zip.files[0].text).tracks).toHaveLength(1);
});

test("repeated exports give the same ZIP contents", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await draw(page, 3);
  await setPaddle(page, 1);
  for (const leg of [0, 1])
    await expect(legLines(page).nth(leg)).toHaveClass(/leg-routed/);
  const first = await downloadGpxZip(page, exportButton(page));
  const second = await downloadGpxZip(page, exportButton(page));
  expect(second).toEqual(first);
});

test("a name with characters illegal in file names gives flat, safe ZIP entries", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  await draw(page, 3);
  await tripName(page).fill("Lesse / Ourthe");
  await setPaddle(page, 1);

  const zip = await downloadGpxZip(page, exportButton(page));

  expect(zip.name).not.toMatch(/[/\\:*?"<>|]/);
  expect(zip.name.endsWith(".zip")).toBe(true);
  expect(zip.files).toHaveLength(2);
  for (const file of zip.files) {
    expect(file.name).not.toMatch(/[/\\:*?"<>|]/);
    expect(file.name.endsWith(".gpx")).toBe(true);
  }
});

test("Export stays disabled until there is a leg, with the unchanged disabled-reason tooltip", async ({
  page,
}) => {
  await serveOffline(page);
  await page.goto("/");
  await expect(
    mapRegion(page).locator("img.leaflet-tile-loaded").first(),
  ).toBeVisible();
  await expect(exportButton(page)).toBeDisabled();
  await expect(exportButton(page)).toHaveAccessibleDescription(
    "Nothing to export yet: click the map twice to add a leg.",
  );
  const box = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(exportButton(page)).toBeDisabled();
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
  await expect(exportButton(page)).toBeEnabled();
});
