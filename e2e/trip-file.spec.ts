// Save to file / open from file (#10). BRouter is answered from recorded responses.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const newTripButton = (page: Page) => page.getByRole("button", { name: strings.newTripButton });
const saveFileButton = (page: Page) => page.getByRole("button", { name: strings.saveFileButton });
const openFileButton = (page: Page) => page.getByRole("button", { name: strings.openFileButton });
const fileError = (page: Page) => page.getByRole("alert").filter({ hasText: strings.openFileInvalid });
const modeButton = (page: Page, leg: number, mode: string) =>
  rows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name: mode });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Opens the app and returns a function that clicks the map `dx`, `dy` pixels from its centre. */
async function openMap(page: Page) {
  await page.goto("/");
  await waitForMap(page);
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** Draws a named trip with a routed hike leg and a routed paddle leg. */
async function drawTrip(page: Page, name: string) {
  const clickMap = await openMap(page);
  await tripName(page).fill(name);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await expect(legLines(page)).toHaveCount(2);
  await modeButton(page, 1, strings.legModePaddle).click();
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  return clickMap;
}

async function saveToFile(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), saveFileButton(page).click()]);
  return { name: download.suggestedFilename(), path: await download.path() };
}

async function openFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), openFileButton(page).click()]);
  await chooser.setFiles(file);
}

const linePaths = (page: Page) => legLines(page).evaluateAll((paths) => paths.map((p) => p.getAttribute("d")));

test("save file, start a new trip, open the file: the trip is restored without routing again", async ({ page }) => {
  const network = await serveOffline(page, {
    brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL),
  });
  await drawTrip(page, "Ourthe weekend");
  const pathsBefore = await linePaths(page);
  const requestsBefore = network.brouter.length;

  const saved = await saveToFile(page);
  expect(saved.name).toBe("Ourthe weekend.packraft.json");
  expect(JSON.parse(await readFile(saved.path, "utf8"))).toMatchObject({
    format: "packraft-go-trip",
    version: 2, // Updated for #8: the save format is now version 2.
    trip: { name: "Ourthe weekend" },
  });

  // Updated for Base UI (#31): the questions are in-page dialogs, not window.confirm.
  await newTripButton(page).click();
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(tripName(page)).toHaveValue("");

  // The trip is empty now, so opening a file does not ask.
  await openFile(page, saved.path);

  await expect(tripName(page)).toHaveValue("Ourthe weekend");
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  expect(await linePaths(page)).toEqual(pathsBefore);
  await expect(modeButton(page, 1, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);
  await expect(confirmDialog(page)).toHaveCount(0);

  // The opened trip is the current trip, so it is autosaved.
  await page.reload();
  await waitForMap(page);
  await expect(tripName(page)).toHaveValue("Ourthe weekend");
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

  await expect(tripName(page)).toHaveValue("Keep me");
  await expect(pointMarkers(page)).toHaveCount(3);
  expect(await linePaths(page)).toEqual(pathsBefore);
  // Updated for Base UI (#31): no in-page confirmation was shown.
  await expect(confirmDialog(page)).toHaveCount(0);

  // The error goes away once the planner carries on.
  await tripName(page).fill("Keep me too");
  await expect(fileError(page)).toHaveCount(0);

  await page.reload();
  await waitForMap(page);
  await expect(tripName(page)).toHaveValue("Keep me too");
  await expect(pointMarkers(page)).toHaveCount(3);
});

test("opening a file over a trip with points asks first; cancelling keeps the current trip", async ({ page }) => {
  await serveOffline(page, { brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await drawTrip(page, "Saved plan");
  const saved = await saveToFile(page);

  await tripName(page).fill("Current plan");
  await clickMap(0, 100);
  await expect(pointMarkers(page)).toHaveCount(4);

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await openFile(page, saved.path);
  await answerConfirmation(page, "openFile", "cancel");
  await expect(tripName(page)).toHaveValue("Current plan");
  await expect(pointMarkers(page)).toHaveCount(4);

  await openFile(page, saved.path);
  await answerConfirmation(page, "openFile", "confirm");
  await expect(tripName(page)).toHaveValue("Saved plan");
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(confirmDialog(page)).toHaveCount(0);
});
