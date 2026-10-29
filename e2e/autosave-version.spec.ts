// An autosave from a newer or unknown version is kept and the planner warns (#28).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { expectTripName, freeMapBox, menuItem, openTripFile, renameTrip, tripPanel } from "./support/planner";

const TRIP_KEY = "packraft-go.trip";
const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const warning = (page: Page) => page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion });
const storedTrip = (page: Page) => page.evaluate((key) => localStorage.getItem(key), TRIP_KEY);

/** A save of a two-point trip in the given format version. */
const saveText = (version: number) =>
  JSON.stringify({
    format: "packraft-go-trip",
    version,
    trip: {
      name: "From the future",
      points: [
        { lat: 50.3, lng: 5.6 },
        { lat: 50.31, lng: 5.61 },
      ],
      legs: [{ mode: "hike" }],
      someNewField: true,
    },
  });
const NEWER = saveText(3);

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Opens the app with `stored` as the autosave, and returns a function that clicks the map near its centre. */
async function openWithStored(page: Page, stored: string) {
  await page.goto("/");
  await waitForMap(page);
  await page.evaluate(([key, text]) => localStorage.setItem(key, text), [TRIP_KEY, stored]);
  await page.reload();
  await waitForMap(page);
  const box = (await freeMapBox(page));
  return (dx: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
}

test("a newer-version autosave is kept, with a warning, while the planner edits", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const clickMap = await openWithStored(page, NEWER);

  await expect(warning(page)).toBeVisible();
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(tripPanel(page)).toContainText(strings.legsPanelEmpty);
  expect(await storedTrip(page)).toBe(NEWER);

  // Edits happen in memory but do not overwrite the kept save.
  await renameTrip(page, "Scratch");
  await clickMap(-100);
  await clickMap(100);
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(warning(page)).toBeVisible();
  expect(await storedTrip(page)).toBe(NEWER);

  await page.reload();
  await waitForMap(page);
  await expect(warning(page)).toBeVisible();
  expect(await storedTrip(page)).toBe(NEWER);
  expect(errors).toEqual([]);
});

// Updated: format reset (#52). The old version 2 is the unknown one now.
test("an old version 2 autosave is treated like any other unknown version", async ({ page }) => {
  await serveOffline(page);
  const old = saveText(2);
  await openWithStored(page, old);

  await expect(warning(page)).toBeVisible();
  expect(await storedTrip(page)).toBe(old);
});

test("starting a new trip replaces the kept save and clears the warning", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openWithStored(page, NEWER);
  await expect(warning(page)).toBeVisible();

  await clickMap(-100);
  await clickMap(100);
  await expect(pointMarkers(page)).toHaveCount(2);
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");

  await expect(warning(page)).toHaveCount(0);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect.poll(() => storedTrip(page)).not.toBe(NEWER);
  // Updated: format reset (#52).
  expect(JSON.parse((await storedTrip(page))!)).toMatchObject({ version: 1, trip: { points: [] } });

  // From now on edits are saved again.
  await renameTrip(page, "Fresh start");
  await page.reload();
  await waitForMap(page);
  await expect(warning(page)).toHaveCount(0);
  await expectTripName(page, "Fresh start");
});

test("new trip on the empty planner also replaces the kept save, without asking", async ({ page }) => {
  await serveOffline(page);
  await openWithStored(page, NEWER);
  await expect(warning(page)).toBeVisible();

  await menuItem(page, strings.phone.menu.newTrip);

  await expect(warning(page)).toHaveCount(0);
  await expect.poll(() => storedTrip(page)).not.toBe(NEWER);
});

test("opening a trip file replaces the kept save and clears the warning", async ({ page }) => {
  await serveOffline(page);
  await openWithStored(page, NEWER);
  await expect(warning(page)).toBeVisible();

  // Updated: format reset (#52). A valid file is version 1.
  const file = { name: "lesse.packraft.json", mimeType: "application/json", buffer: Buffer.from(saveText(1)) };
  await openTripFile(page, file);

  await expect(pointMarkers(page)).toHaveCount(2);
  await expectTripName(page, "From the future");
  await expect(warning(page)).toHaveCount(0);
  await page.reload();
  await waitForMap(page);
  await expectTripName(page, "From the future");
  await expect(warning(page)).toHaveCount(0);
});

test("opening a file that fails keeps the save and the warning", async ({ page }) => {
  await serveOffline(page);
  await openWithStored(page, NEWER);

  const file = { name: "broken.packraft.json", mimeType: "application/json", buffer: Buffer.from("{corrupt") };
  await openTripFile(page, file);

  await expect(page.getByRole("alert").filter({ hasText: strings.openFileInvalid })).toBeVisible();
  await expect(warning(page)).toBeVisible();
  expect(await storedTrip(page)).toBe(NEWER);
});

test("corrupt autosave data gives an empty trip, without the version warning", async ({ page }) => {
  await serveOffline(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWithStored(page, "{corrupt");

  await expect(tripPanel(page)).toContainText(strings.legsPanelEmpty);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(warning(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
