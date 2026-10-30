// Save to file / open from file (#10). BRouter is answered from recorded responses.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  expectTripName,
  freeMapBox,
  legRows as rows,
  mapClicker,
  menuItem,
  openPlanner,
  openTripFile,
  renameTrip,
  saveTripFile,
} from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const fileError = (page: Page) => page.getByRole("alert").filter({ hasText: strings.openFileInvalid });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Opens the app and returns a function that clicks the map `dx`, `dy` pixels from its centre. */
async function openMap(page: Page) {
  await openPlanner(page);
  return mapClicker(page);
}

/** Draws a named trip with a routed hike leg and a routed paddle leg. */
async function drawTrip(page: Page, name: string) {
  const clickMap = await openMap(page);
  await renameTrip(page, name);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0, "paddle");
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  return clickMap;
}

async function saveToFile(page: Page) {
  const download = await saveTripFile(page);
  return { name: download.suggestedFilename(), path: await download.path() };
}

async function openFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await openTripFile(page, file);
}

const linePaths = (page: Page) => legLines(page).evaluateAll((paths) => paths.map((p) => p.getAttribute("d")));

test("save file, start a new trip, open the file: the trip is restored without routing again", async ({ page }) => {
  const network = await serveOffline(page, {
    brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL),
  });
  await drawTrip(page, "Ourthe weekend");
  const requestsBefore = network.brouter.length;

  const saved = await saveToFile(page);
  expect(saved.name).toBe("Ourthe weekend.packraft.json");
  expect(JSON.parse(await readFile(saved.path, "utf8"))).toMatchObject({
    format: "packraft-go-trip",
    version: 1, // Updated for #8: the save format is now version 2. Updated: format reset (#52). Version 1 again.
    trip: { name: "Ourthe weekend" },
  });

  // Updated for Base UI (#31): the questions are in-page dialogs, not window.confirm.
  await menuItem(page, strings.planner.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(pointMarkers(page)).toHaveCount(0);
  await expectTripName(page, "");

  // The trip is empty now, so opening a file does not ask.
  await openFile(page, saved.path);

  await expectTripName(page, "Ourthe weekend");
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  // Opened over an empty planner, the map fits the trip: the same routes, every point in the part
  // of the map the panel leaves free.
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("packraft-go.trip")))!).trip.legs).toEqual(
    JSON.parse(await readFile(saved.path, "utf8")).trip.legs,
  );
  const free = await freeMapBox(page);
  for (const point of await pointMarkers(page).all()) {
    const box = (await point.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(free.x);
    expect(box.x + box.width).toBeLessThanOrEqual(free.x + free.width);
  }
  await expect(rows(page).nth(1)).toHaveClass(/planner-row-paddle/);
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);
  await expect(confirmDialog(page)).toHaveCount(0);

  // The opened trip is the current trip, so it is autosaved.
  await page.reload();
  await waitForMap(page);
  await expectTripName(page, "Ourthe weekend");
  await expect(pointMarkers(page)).toHaveCount(3);

  await page.waitForTimeout(500);
  expect(network.brouter).toHaveLength(requestsBefore);
  expect(network.blocked).toEqual([]);
});

test("an invalid file shows a clear error and leaves the current trip unchanged", async ({ page }) => {
  await serveOffline(page, { brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  await drawTrip(page, "Keep me");
  const pathsBefore = await linePaths(page);

  await openFile(page, { name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello": 1}') });
  await expect(fileError(page)).toBeVisible();
  await openFile(page, { name: "photo.packraft.json", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50]) });
  await expect(fileError(page)).toBeVisible();

  await expectTripName(page, "Keep me");
  await expect(pointMarkers(page)).toHaveCount(3);
  expect(await linePaths(page)).toEqual(pathsBefore);
  // Updated for Base UI (#31): no in-page confirmation was shown.
  await expect(confirmDialog(page)).toHaveCount(0);

  // The error goes away once the planner carries on.
  await renameTrip(page, "Keep me too");
  await expect(fileError(page)).toHaveCount(0);

  await page.reload();
  await waitForMap(page);
  await expectTripName(page, "Keep me too");
  await expect(pointMarkers(page)).toHaveCount(3);
});

test("opening a file over a trip with points asks first; cancelling keeps the current trip", async ({ page }) => {
  await serveOffline(page, { brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await drawTrip(page, "Saved plan");
  const saved = await saveToFile(page);

  await renameTrip(page, "Current plan");
  await clickMap(0, 100);
  await expect(pointMarkers(page)).toHaveCount(4);

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await openFile(page, saved.path);
  await answerConfirmation(page, "openFile", "cancel");
  await expectTripName(page, "Current plan");
  await expect(pointMarkers(page)).toHaveCount(4);

  await openFile(page, saved.path);
  await answerConfirmation(page, "openFile", "confirm");
  await expectTripName(page, "Saved plan");
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(confirmDialog(page)).toHaveCount(0);
});
