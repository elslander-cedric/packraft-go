// Acceptance tests for #10 (save to file / open from file) written
// from the issue, spec #2 (stories 41-44) and ADR 0011, before reading the diff.
// BRouter is answered from the committed recorded responses (ADR 0019); every
// request is counted so "no re-routing" can be checked.
// Updated for Base UI (#31): the "replace this trip?" questions are in-page
// Alert Dialogs instead of window.confirm; tests answer them with its buttons.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  expectTripName,
  legRows as rows,
  mapClicker,
  menuItem,
  openPlanner,
  openTripFile,
  renameTrip,
  saveTripFile,
  tripPanel as panel,
} from "./support/planner";

const KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const errorAlert = (page: Page) => page.getByRole("alert").filter({ hasText: strings.openFileInvalid });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const NO_ROUTE: BRouterReply = { status: 400, body: brouterFixture("hiking-no-route-400.txt") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

const storedText = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

async function openMap(page: Page) {
  await openPlanner(page);
  return mapClicker(page);
}

async function save(page: Page) {
  const dl = await saveTripFile(page);
  return { name: dl.suggestedFilename(), text: await readFile((await dl.path())!, "utf8") };
}

async function open(page: Page, name: string, text: string) {
  await openTripFile(page, { name, mimeType: "application/json", buffer: Buffer.from(text, "utf8") });
}

/** Hike (routed) -> paddle (routed) -> hike (failed) trip. */
async function drawMixedTrip(page: Page, name: string) {
  let failNext = false;
  const net = await serveOffline(page, { brouter: (url) => (failNext ? NO_ROUTE : byProfile(url)) });
  const click = await openMap(page);
  await renameTrip(page, name);
  await click(-200, 0);
  await click(-60, 0);
  await click(60, 0, "paddle");
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  failNext = true;
  await click(200, 0, "hike");
  await expect(rows(page).nth(2)).toContainText(strings.retryRouting);
  failNext = false;
  return { net, click };
}

test("#10: the saved file is exactly the autosave format, named after the trip", async ({ page }) => {
  await drawMixedTrip(page, "Ourthe: weekend");
  await expect.poll(async () => JSON.parse((await storedText(page)) ?? "{}").trip?.legs?.length).toBe(3);

  const file = await save(page);
  expect(file.name).toBe("Ourthe- weekend.packraft.json");
  // One format: what is downloaded is byte-for-byte what autosave stores.
  expect(file.text).toBe(await storedText(page));
  const parsed = JSON.parse(file.text);
  // Updated in round 2 of #8: the save format is now version 2 (it includes camps).
  // Updated: format reset (#52). The save format is version 1 again.
  expect(parsed).toMatchObject({ format: "packraft-go-trip", version: 1 });
  expect(parsed.trip).not.toHaveProperty("undoSteps");
});

test("#10: an unnamed trip, and an empty trip, can be saved", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await openMap(page);
  const file = await save(page);
  expect(file.name).toBe(`${strings.tripNamePlaceholder}.packraft.json`);
  expect(JSON.parse(file.text).trip).toEqual({ name: "", points: [], legs: [] });
});

test("#10: opening restores paddle legs, climb, drop and failed legs with no routing calls, like a reload", async ({ page }) => {
  const { net } = await drawMixedTrip(page, "Round trip");
  const file = await save(page);
  const panelBefore = await panel(page).innerText();
  const calls = net.brouter.length;

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(pointMarkers(page)).toHaveCount(0);

  await open(page, file.name, file.text);
  await expect(pointMarkers(page)).toHaveCount(4);
  await expectTripName(page, "Round trip");
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(rows(page).nth(1)).toHaveClass(/phone-row-paddle/);
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);
  await expect(rows(page).nth(2)).toContainText(strings.retryRouting);
  // Opened over an empty planner, the map fits the trip, so the routes are compared as stored.
  expect(JSON.parse((await storedText(page))!).trip.legs).toEqual(JSON.parse(file.text).trip.legs);
  expect(await panel(page).innerText()).toBe(panelBefore);
  // Same as an autosave restore: no undo history.
  await expect(undoBtn(page)).toBeDisabled();
  await expect(errorAlert(page)).toHaveCount(0);

  await page.waitForTimeout(800);
  expect(net.brouter).toHaveLength(calls);
  expect(net.blocked).toEqual([]);

  // The opened trip is autosaved in the same format, and survives a reload.
  await expect.poll(() => storedText(page)).toBe(file.text);
  await page.reload();
  await expect(legLines(page)).toHaveCount(3);
  expect(await panel(page).innerText()).toBe(panelBefore);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(calls);
});

test("#10: undo after opening steps back within the opened trip only, never into the replaced trip", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  await click(-150, 0);
  await click(150, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  const file = await save(page);

  // A different trip with its own undo history.
  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await click(0, -100);
  await click(0, 100);
  await click(100, 100);
  await expect(undoBtn(page)).toBeEnabled();

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await open(page, file.name, file.text);
  await answerConfirmation(page, "openFile", "confirm");
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(undoBtn(page)).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(pointMarkers(page)).toHaveCount(2);

  await click(0, 150);
  await expect(pointMarkers(page)).toHaveCount(3);
  await undoBtn(page).click();
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(undoBtn(page)).toBeDisabled();
  expect(await storedText(page)).toBe(file.text);
  expect(net.blocked).toEqual([]);
});

test("#10: a leg that was still routing when saved is routed after opening, as after a reload", async ({ page }) => {
  let release!: () => void;
  let hold = true;
  const held = new Promise<BRouterReply>((r) => (release = () => r(TRAIL)));
  const net = await serveOffline(page, { brouter: () => (hold ? held : TRAIL) });
  const click = await openMap(page);
  await click(-150, 0);
  await click(150, 0);
  await expect(rows(page).first().getByRole("status")).toBeVisible();
  const file = await save(page);
  hold = false;

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  release();
  await open(page, file.name, file.text);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(rows(page).first().getByRole("status")).toHaveCount(0);
  await expect(rows(page).first()).toContainText(`${strings.climbLabel} 100 m`);
  // The router may reuse the answer it already received for this exact leg (#4); never more than one new request.
  expect(net.brouter.length).toBeLessThanOrEqual(2);
});

// Updated in round 2 of #8: each case names the error it expects. A newer
// version now gets its own message (strings.openFileUnknownVersion).
const INVALID: [string, string, string][] = [
  ["not JSON", "{corrupt", strings.openFileInvalid],
  ["an empty file", "", strings.openFileInvalid],
  ["JSON that is not a trip", JSON.stringify({ hello: "world" }), strings.openFileInvalid],
  ["a newer version", JSON.stringify({ format: "packraft-go-trip", version: 99, trip: { name: "x", points: [], legs: [] } }), strings.openFileUnknownVersion],
  // Updated: v1 dropped (#33). Version 2, so this stays a damaged file, not an unknown version.
  // Updated: format reset (#52). Version 1, the current version.
  ["legs not matching points", JSON.stringify({ format: "packraft-go-trip", version: 1, trip: { name: "x", points: [{ lat: 50, lng: 5 }], legs: [{ mode: "hike" }] } }), strings.openFileInvalid],
  ["a GPX file", '<?xml version="1.0"?><gpx version="1.1"><trk><name>x</name></trk></gpx>', strings.openFileInvalid],
];

for (const [label, text, message] of INVALID) {
  test(`#10: an invalid file (${label}) shows an error, never asks, and leaves the trip and storage unchanged`, async ({ page }) => {
    const { net } = await drawMixedTrip(page, "Keep me");
    await expect.poll(async () => JSON.parse((await storedText(page)) ?? "{}").trip?.legs?.length).toBe(3);
    const storedBefore = await storedText(page);
    // Updated: access status loads after the legs (#58); compare the panel once it is in.
    await expect(panel(page).locator(".leg-access-icons").first()).toBeVisible();
    const panelBefore = await panel(page).innerText();
    const calls = net.brouter.length;

    await open(page, "bad.json", text);
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await page.waitForTimeout(300);
    // Updated for Base UI (#31): no in-page confirmation was shown.
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(pointMarkers(page)).toHaveCount(4);
    await expectTripName(page, "Keep me");
    expect(await panel(page).innerText()).toBe(panelBefore);
    expect(await storedText(page)).toBe(storedBefore);
    await expect(undoBtn(page)).toBeEnabled();
    expect(net.brouter).toHaveLength(calls);
  });
}

// Updated: v1 dropped (#33). A version 1 file used to open as a trip without
// camps; now it is refused as an unknown version and the current trip stays.
// Updated: format reset (#52). Version 1 is current again; the old version 2 is the one refused.
test("#10: an old version 2 file is refused as an unknown version and leaves the trip and storage unchanged", async ({ page }) => {
  const { net } = await drawMixedTrip(page, "Keep me");
  await expect.poll(async () => JSON.parse((await storedText(page)) ?? "{}").trip?.legs?.length).toBe(3);
  const storedBefore = await storedText(page);
  const calls = net.brouter.length;
  const versionTwo = JSON.stringify({
    format: "packraft-go-trip",
    version: 2,
    trip: {
      name: "From version 2",
      points: [
        { lat: 50.3, lng: 5.6 },
        { lat: 50.31, lng: 5.61 },
      ],
      legs: [{ mode: "hike", route: { status: "failed", failure: { kind: "no-route" } } }],
    },
  });

  await open(page, "old.packraft.json", versionTwo);
  await expect(page.getByRole("alert").filter({ hasText: strings.openFileUnknownVersion })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: strings.openFileInvalid })).toHaveCount(0);
  await page.waitForTimeout(300);
  // Updated for Base UI (#31): no in-page confirmation was shown.
  await expect(confirmDialog(page)).toHaveCount(0);
  await expectTripName(page, "Keep me");
  await expect(pointMarkers(page)).toHaveCount(4);
  expect(await storedText(page)).toBe(storedBefore);
  expect(net.brouter).toHaveLength(calls);
});

test("#10: the error goes away after a successful open, and the same file can be opened twice", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  await renameTrip(page, "Twice");
  await click(-150, 0);
  await click(150, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  const file = await save(page);

  // Updated for Base UI (#31): each open over points asks once, in an in-page dialog.
  await open(page, "bad.json", "nope");
  await expect(errorAlert(page)).toBeVisible();
  await expect(confirmDialog(page)).toHaveCount(0);
  await open(page, file.name, file.text);
  await answerConfirmation(page, "openFile", "confirm");
  await expect(errorAlert(page)).toHaveCount(0);

  await click(0, 120);
  await expect(pointMarkers(page)).toHaveCount(3);
  await open(page, file.name, file.text);
  await answerConfirmation(page, "openFile", "confirm");
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(confirmDialog(page)).toHaveCount(0);
});

test("#10: opening over a trip with points asks; cancel keeps it; OK replaces it; an empty trip is not asked about", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  await renameTrip(page, "From file");
  await click(-150, 0);
  await click(150, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  const file = await save(page);

  // Updated for Base UI (#31): the questions are in-page dialogs, answered with their buttons.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await renameTrip(page, "Current");
  await click(0, 100);
  await expect(pointMarkers(page)).toHaveCount(1);
  await expect.poll(async () => JSON.parse((await storedText(page))!).trip.points.length).toBe(1);
  const storedBefore = await storedText(page);

  await open(page, file.name, file.text);
  await answerConfirmation(page, "openFile", "cancel");
  await page.waitForTimeout(300);
  await expectTripName(page, "Current");
  await expect(pointMarkers(page)).toHaveCount(1);
  expect(await storedText(page)).toBe(storedBefore);

  await open(page, file.name, file.text);
  await answerConfirmation(page, "openFile", "confirm");
  await expectTripName(page, "From file");
  await expect(pointMarkers(page)).toHaveCount(2);

  // A trip without points (only a name) is replaced without asking.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await renameTrip(page, "Name only");
  await open(page, file.name, file.text);
  await expectTripName(page, "From file");
  await expect(confirmDialog(page)).toHaveCount(0);
});
