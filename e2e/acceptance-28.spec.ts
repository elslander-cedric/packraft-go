// Acceptance tests for #28: an autosave from a newer or unknown version
// is kept and the planner warns, instead of silently replacing it with an empty trip.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const TRIP_KEY = "packraft-go.trip";
const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const warning = (page: Page) => page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion });
const storedTrip = (page: Page) => page.evaluate((key) => localStorage.getItem(key), TRIP_KEY);

const save = (version: unknown) =>
  JSON.stringify({
    format: "packraft-go-trip",
    version,
    trip: {
      name: "Planned in a newer tab",
      points: [
        { lat: 50.3, lng: 5.6 },
        { lat: 50.31, lng: 5.61 },
      ],
      legs: [{ mode: "hike" }],
    },
  });
const NEWER = save(3);
// Updated: format reset (#52). The valid file is version 1.
const validFile = (name: string) => ({
  name,
  mimeType: "application/json",
  buffer: Buffer.from(save(1)),
});

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

async function openWithStored(page: Page, stored: string) {
  await page.goto("/");
  await waitForMap(page);
  await page.evaluate(([key, text]) => localStorage.setItem(key, text), [TRIP_KEY, stored]);
  await page.reload();
  await waitForMap(page);
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
}

test("AC1: a newer-version autosave shows a clear message about the newer version and reloading", async ({ page }) => {
  await serveOffline(page);
  await openWithStored(page, NEWER);
  await expect(warning(page)).toBeVisible();
  const text = (await warning(page).textContent()) ?? "";
  expect(text).toMatch(/newer/i);
  expect(text).toMatch(/reload/i);
  // The string comes from the strings module (AC4) and is not empty.
  expect(strings.autosaveUnknownVersion.length).toBeGreaterThan(20);
});

test("AC2 + data loss: work drawn while the warning shows is not saved, and the warning says so", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const clickMap = await openWithStored(page, NEWER);

  await tripName(page).fill("My new work");
  await clickMap(-120);
  await clickMap(0);
  await clickMap(120);
  await expect(pointMarkers(page)).toHaveCount(3);

  // While editing, the user is told that changes are not being saved.
  await expect(warning(page)).toBeVisible();
  await expect(warning(page)).toContainText(/not saved/i);
  await expect(warning(page)).toContainText(/new trip/i);
  await expect(warning(page)).toContainText(/open a file/i);
  await page.waitForTimeout(300);
  expect(await storedTrip(page)).toBe(NEWER);

  // Reload: the newer save is intact; the in-memory work is gone (as the warning said).
  await page.reload();
  await waitForMap(page);
  await expect(warning(page)).toBeVisible();
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(tripName(page)).not.toHaveValue("My new work");
  expect(await storedTrip(page)).toBe(NEWER);
  expect(errors).toEqual([]);
});

test("AC2: undo and redo while the warning shows do not write the save", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openWithStored(page, NEWER);
  await clickMap(-100);
  await clickMap(100);
  await expect(pointMarkers(page)).toHaveCount(2);
  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect(pointMarkers(page)).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(await storedTrip(page)).toBe(NEWER);
  await expect(warning(page)).toBeVisible();
});

test("AC2: cancelling New trip keeps the save, the warning and the in-memory trip", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openWithStored(page, NEWER);
  await clickMap(-100);
  await clickMap(100);
  await expect(pointMarkers(page)).toHaveCount(2);

  await page.getByRole("button", { name: strings.newTripButton }).click();
  await answerConfirmation(page, "newTrip", "cancel");

  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(warning(page)).toBeVisible();
  await page.waitForTimeout(300);
  expect(await storedTrip(page)).toBe(NEWER);
});

test("AC2: cancelling Open file keeps the save and the warning; confirming replaces it", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openWithStored(page, NEWER);
  await clickMap(-100);
  await clickMap(100);
  await expect(pointMarkers(page)).toHaveCount(2);

  const openFile = async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: strings.openFileButton }).click(),
    ]);
    await chooser.setFiles(validFile("lesse.packraft.json"));
  };

  await openFile();
  await answerConfirmation(page, "openFile", "cancel");
  await expect(warning(page)).toBeVisible();
  await page.waitForTimeout(300);
  expect(await storedTrip(page)).toBe(NEWER);

  await openFile();
  await answerConfirmation(page, "openFile", "confirm");
  await expect(warning(page)).toHaveCount(0);
  // Updated: format reset (#52).
  await expect.poll(async () => JSON.parse((await storedTrip(page)) ?? "{}").version).toBe(1);
  await expect(tripName(page)).toHaveValue("Planned in a newer tab");
});

for (const [label, text] of [
  ["empty text", ""],
  ["the literal null", "null"],
  ["a JSON array", "[]"],
  ["a bare number", "42"],
  ["unparseable text", "{corrupt"],
  ["a save without a version", JSON.stringify({ format: "packraft-go-trip", trip: {} })],
  ["a different format", JSON.stringify({ format: "other-app", version: 3, trip: {} })],
] as const) {
  // Updated: format reset (#52). Drawing saves version 1.
  test(`AC3: corrupt autosave (${label}) gives an empty trip, no warning, no crash, and drawing saves v1`, async ({
    page,
  }) => {
    await serveOffline(page, { brouter: () => SNAPPED });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const clickMap = await openWithStored(page, text);

    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(warning(page)).toHaveCount(0);
    // No warning of any kind (Next.js keeps an empty route-announcer alert, so only count alerts with text).
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);

    await clickMap(-100);
    await clickMap(100);
    await expect(pointMarkers(page)).toHaveCount(2);
    await expect.poll(async () => JSON.parse((await storedTrip(page)) ?? "{}").version).toBe(1);
    expect(errors).toEqual([]);
  });
}
