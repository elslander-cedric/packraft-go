// Tester acceptance tests for #33: version 2 is the only save-format version.
// Version 1 is refused the same way as other unknown versions, in autosave and Open file.
// Updated: format reset (#52). Version 1 is the only version again; the old version 2 is refused the
// same way as other unknown versions, so the roles of 1 and 2 are swapped.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const openBtn = (page: Page) => page.getByRole("button", { name: strings.openFileButton });
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const storedText = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

const failed = { status: "failed", failure: { kind: "no-route" } };
const twoPoints = {
  name: "Old format",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
  ],
  legs: [{ mode: "hike", route: failed }],
};
const save = (version: number) => JSON.stringify({ format: "packraft-go-trip", version, trip: twoPoints });

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

async function openFile(page: Page, text: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), openBtn(page).click()]);
  await chooser.setFiles({ name: "trip.packraft.json", mimeType: "application/json", buffer: Buffer.from(text) });
}

/** Loads the app with `text` already in the autosave slot; returns what storage holds after load settles. */
async function loadWithAutosave(page: Page, text: string) {
  await serveOffline(page);
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [KEY, text],
  );
  await page.goto("/");
  await waitForMap(page);
  await page.waitForTimeout(500);
  return storedText(page);
}

test("#33, #52: an old version 2 autosave is handled exactly like a version 3 autosave (empty trip, same storage outcome)", async ({
  browser,
}) => {
  const outcome = async (version: number) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const seeded = save(version);
    const stored = await loadWithAutosave(page, seeded);
    const result = {
      name: await tripName(page).inputValue(),
      points: await pointMarkers(page).count(),
      storageKept: stored === seeded,
      alert: await alertWith(page, strings.openFileUnknownVersion).count(),
      errors,
    };
    await context.close();
    return result;
  };
  const v2 = await outcome(2);
  expect(v2).toMatchObject({ name: "", points: 0, alert: 0, errors: [] });
  expect(v2).toEqual(await outcome(3));
});

test("#33, #52: opening an old version 2 file on an empty planner shows the unknown-version message and changes nothing, twice in a row", async ({
  page,
}) => {
  const net = await serveOffline(page);
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await page.goto("/");
  await waitForMap(page);
  const before = await storedText(page);

  for (let i = 0; i < 2; i++) {
    await openFile(page, save(2));
    await expect(alertWith(page, strings.openFileUnknownVersion)).toBeVisible();
    await expect(alertWith(page, strings.openFileInvalid)).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(tripName(page)).toHaveValue("");
    await expect(pointMarkers(page)).toHaveCount(0);
    expect(await storedText(page)).toBe(before);
  }
  expect(dialogs).toEqual([]);
  expect(net.brouter).toHaveLength(0);

  // The same content as version 1 opens, and the message goes away.
  await openFile(page, save(1));
  await expect(tripName(page)).toHaveValue("Old format");
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(alertWith(page, strings.openFileUnknownVersion)).toHaveCount(0);
});
