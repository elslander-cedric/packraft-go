// Tester acceptance tests for #8, round 2: the save format rule Cedric approved.
// Always write version 2 (autosave and file); read version 1 (no camps) and 2;
// refuse any other version with a "newer or unknown version" message and leave
// the current trip untouched. Unreadable autosave falls back to an empty trip.
// Updated: v1 dropped (#33). Version 2 is now the only version read; version 1
// is refused like any other unknown version.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const campMarkers = (page: Page) => mapRegion(page).getByRole("img", { name: strings.campMarker });
const daysPanel = (page: Page) => page.getByRole("complementary", { name: strings.daysPanelLabel });
const dayRows = (page: Page) => daysPanel(page).getByRole("listitem");
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton, exact: true });
const saveBtn = (page: Page) => page.getByRole("button", { name: strings.saveFileButton });
const openBtn = (page: Page) => page.getByRole("button", { name: strings.openFileButton });
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const storedText = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

const failed = { status: "failed", failure: { kind: "no-route" } };
const threePoints = {
  name: "Seeded",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
    { lat: 50.32, lng: 5.62 },
  ],
  legs: [
    { mode: "hike", route: failed },
    { mode: "paddle", route: failed },
  ],
};
const save = (version: unknown, trip: Record<string, unknown>) =>
  JSON.stringify({ format: "packraft-go-trip", version, trip });

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Puts `text` in the autosave slot before the first load only. */
async function seedAutosave(page: Page, text: string) {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [KEY, text],
  );
}

async function openFile(page: Page, text: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), openBtn(page).click()]);
  await chooser.setFiles({ name: "trip.packraft.json", mimeType: "application/json", buffer: Buffer.from(text) });
}

/** Two hike legs drawn by clicking, with a camp on the middle point. */
async function drawTwoDayTrip(page: Page) {
  await page.goto("/");
  await waitForMap(page);
  const box = (await mapRegion(page).boundingBox())!;
  const click = (dx: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
  await tripName(page).fill("Mine");
  await click(-150);
  await click(0);
  await click(150);
  await expect(legLines(page)).toHaveCount(2);
  await click(0);
  await campButton(page).click();
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(dayRows(page)).toHaveCount(2);
}

test("autosave of a trip with camps is version 2, and a reload brings the camps back", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  await drawTwoDayTrip(page);
  await expect.poll(async () => JSON.parse((await storedText(page)) ?? "{}")).toMatchObject({
    version: 2,
    trip: { camps: [1] },
  });
  const calls = net.brouter.length;
  await page.reload();
  await waitForMap(page);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(dayRows(page)).toHaveCount(2);
  expect(net.brouter.length).toBe(calls);
});

test("a saved file of a trip with camps is version 2 with the camps, identical to the autosave", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawTwoDayTrip(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), saveBtn(page).click()]);
  const text = await readFile((await dl.path())!, "utf8");
  expect(JSON.parse(text)).toMatchObject({ format: "packraft-go-trip", version: 2, trip: { camps: [1] } });
  expect(text).toBe(await storedText(page));
});

test("a version 2 autosave with camps loads them", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await seedAutosave(page, save(2, { ...threePoints, camps: [1] }));
  await page.goto("/");
  await waitForMap(page);
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(dayRows(page)).toHaveCount(2);
});

for (const [label, text] of [
  ["version 3 with camps", save(3, { ...threePoints, camps: [1] })],
  ["version 0", save(0, threePoints)],
  // Updated: v1 dropped (#33). A version 1 autosave used to load as a trip without camps.
  ["version 1", save(1, threePoints)],
  ["version 99 in an unknown shape", save(99, { stages: [{ x: 1 }] })],
  ["version 2 with a camp on a missing point", save(2, { ...threePoints, camps: [9] })],
  ["version 2 with camps that are not a list", save(2, { ...threePoints, camps: "1" })],
  ["corrupt JSON", '{"format":"packraft-go-trip","version":2,'],
] as const) {
  test(`an autosave holding ${label} falls back to an empty trip without crashing, and drawing works`, async ({ page }) => {
    await serveOffline(page, { brouter: byProfile });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seedAutosave(page, text);
    await page.goto("/");
    await waitForMap(page);
    await expect(legsPanel(page)).toContainText(strings.legsPanelEmpty);
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(campMarkers(page)).toHaveCount(0);
    await expect(tripName(page)).toHaveValue("");
    // No file-open error is shown for autosave.
    await expect(page.getByRole("alert").filter({ hasText: strings.openFileUnknownVersion })).toHaveCount(0);
    const box = (await mapRegion(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await expect(legLines(page)).toHaveCount(1);
    await expect.poll(async () => JSON.parse((await storedText(page)) ?? "{}").version).toBe(2);
    expect(errors).toEqual([]);
  });
}

// Updated: v1 dropped (#33): version 1 is refused like the others.
for (const version of [3, 0, 99, 1]) {
  test(`opening a version ${version} file shows the unknown-version message and leaves the trip, its camps and storage untouched`, async ({ page }) => {
    const net = await serveOffline(page, { brouter: byProfile });
    await drawTwoDayTrip(page);
    await expect.poll(async () => JSON.parse((await storedText(page)) ?? "{}").trip?.camps).toEqual([1]);
    const before = await storedText(page);
    const calls = net.brouter.length;

    await openFile(page, save(version, { ...threePoints, name: "From elsewhere", camps: [1] }));
    await expect(alertWith(page, strings.openFileUnknownVersion)).toBeVisible();
    await expect(alertWith(page, strings.openFileInvalid)).toHaveCount(0);
    await page.waitForTimeout(300);
    // Updated for Base UI (#31): no in-page confirmation was shown.
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(tripName(page)).toHaveValue("Mine");
    await expect(pointMarkers(page)).toHaveCount(3);
    await expect(campMarkers(page)).toHaveCount(1);
    await expect(dayRows(page)).toHaveCount(2);
    expect(await storedText(page)).toBe(before);
    expect(net.brouter.length).toBe(calls);
  });
}

test("the unknown-version message tells the planner the file is from a newer or unknown version", async () => {
  expect(strings.openFileUnknownVersion).toMatch(/newer or unknown version/i);
  expect(strings.openFileUnknownVersion).not.toBe(strings.openFileInvalid);
});

test("opening a version 2 file with camps replaces the trip and shows its camps and days", async ({ page }) => {
  const net = await serveOffline(page, { brouter: byProfile });
  await drawTwoDayTrip(page);
  const calls = net.brouter.length;
  await openFile(page, save(2, { ...threePoints, name: "Opened v2", camps: [0, 1] }));
  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await answerConfirmation(page, "openFile", "confirm");
  await expect(tripName(page)).toHaveValue("Opened v2");
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(2);
  await expect(dayRows(page)).toHaveCount(2); // a camp on the start splits nothing
  expect(net.brouter.length).toBe(calls);
});

// Updated: v1 dropped (#33). Used a version 1 file; the valid file is now version 2.
test("after an unknown-version refusal, a valid version 2 file still opens and clears the message", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawTwoDayTrip(page);
  await openFile(page, save(3, threePoints));
  await expect(alertWith(page, strings.openFileUnknownVersion)).toBeVisible();
  await openFile(page, save(2, { ...threePoints, name: "Old one" }));
  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await answerConfirmation(page, "openFile", "confirm");
  await expect(tripName(page)).toHaveValue("Old one");
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(alertWith(page, strings.openFileUnknownVersion)).toHaveCount(0);
});
