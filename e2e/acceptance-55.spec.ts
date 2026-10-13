// Tester's acceptance tests for #55: access points are separate from trips,
// refused imports leave points alone, autosave edge cases, special characters.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const text = strings.accessPoints;
const KEY = "packraft-go.access-points";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const panel = (page: Page) => page.getByRole("complementary", { name: text.panelLabel });
const details = (page: Page) => page.getByRole("region", { name: text.detailsLabel });
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

const T = "2026-10-12T08:00:00.000Z";
const point = (id: string, lat: number, lng: number, note = "") => ({
  id, position: { lat, lng }, use: "both", kind: "slipway", note, checkedOnSite: null, createdAt: T, updatedAt: T,
});
const file = (version: number, pts: unknown[]) =>
  JSON.stringify({ format: "packraft-go-access-points", version, accessPoints: pts });

async function openWith(page: Page, initial?: string) {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  if (initial !== undefined) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, initial]);
    await page.reload();
    await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  }
  const box = (await mapRegion(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function importContents(page: Page, contents: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    panel(page).getByRole("button", { name: text.importButton }).click(),
  ]);
  await chooser.setFiles({ name: "p.json", mimeType: "application/json", buffer: Buffer.from(contents) });
}

test("new trip and opening a trip file leave access points untouched", async ({ page }) => {
  const mid = await openWith(page, file(1, [point("a", 50.5, 5.5, "keep me")]));
  await expect(markers(page)).toHaveCount(1);
  const before = await stored(page);

  // Make a trip so the confirmations show.
  await page.mouse.click(mid.x + 200, mid.y + 100);
  await page.mouse.click(mid.x + 250, mid.y + 100);
  await page.getByRole("button", { name: strings.newTripButton }).click();
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(markers(page)).toHaveCount(1);
  expect(await stored(page)).toBe(before);

  await page.mouse.click(mid.x + 200, mid.y + 100);
  await page.mouse.click(mid.x + 250, mid.y + 100);
  const trip = JSON.stringify({
    format: "packraft-go-trip", version: 1,
    trip: { name: "T", points: [{ lat: 50.3, lng: 5.6 }, { lat: 50.31, lng: 5.61 }], legs: [{ mode: "hike" }] },
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: strings.openFileButton }).click(),
  ]);
  await chooser.setFiles({ name: "t.packraft.json", mimeType: "application/json", buffer: Buffer.from(trip) });
  await answerConfirmation(page, "openFile", "confirm");
  await expect(markers(page)).toHaveCount(1);
  expect(await stored(page)).toBe(before);

  // Importing an access point file does not touch the trip.
  await importContents(page, file(1, [point("b", 50.6, 5.6)]));
  await expect(markers(page)).toHaveCount(2);
  await expect(page.getByRole("textbox", { name: strings.tripNameLabel })).toHaveValue("T");
});

test("trip files are refused by access point import, and unknown versions/garbage leave points untouched", async ({ page }) => {
  await openWith(page, file(1, [point("a", 50.5, 5.5)]));
  const before = await stored(page);
  const cases: [string, string, string][] = [
    ["trip file", JSON.stringify({ format: "packraft-go-trip", version: 1, trip: {} }), text.importInvalid],
    ["v2", file(2, [point("z", 50, 5)]), text.importUnknownVersion],
    ["bad coords", file(1, [point("z", 50, 5), point("y", 95, 5)]), text.importInvalid],
    ["empty file", "", text.importInvalid],
  ];
  for (const [, contents, message] of cases) {
    await importContents(page, contents);
    await expect(panel(page).getByRole("alert")).toHaveText(message);
    await expect(markers(page)).toHaveCount(1);
    expect(await stored(page)).toBe(before);
  }
  await page.reload();
  await expect(markers(page)).toHaveCount(1);
});

test("damaged autosave: starts empty without crashing, and is overwritten by the next change", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mid = await openWith(page, "{corrupt");
  await expect(markers(page)).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: text.autosaveUnknownVersion })).toHaveCount(0);
  // Updated: round 2 (#55). The damaged save is kept under a backup key, and a notice says so,
  // before it is replaced by an empty one.
  const backups = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("packraft-go.access-points.backup-"))
      .map((k) => [k, localStorage.getItem(k)]),
  );
  expect(backups).toHaveLength(1);
  expect(backups[0][1]).toBe("{corrupt");
  await expect(panel(page)).toContainText(text.damagedBackedUp(backups[0][0]!));
  // Note: the damaged save is replaced by an empty one right on load (not only on the next change), like the trip.
  expect(JSON.parse((await stored(page))!).accessPoints).toEqual([]);
  await panel(page).getByRole("button", { name: text.addButton }).click();
  await page.mouse.click(mid.x, mid.y);
  await expect(details(page)).toBeVisible();
  expect(JSON.parse((await stored(page))!).accessPoints).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("unknown-version autosave: warned, kept byte for byte, edits not saved, import not saved", async ({ page }) => {
  const newer = file(2, [point("a", 50.5, 5.5, "from the future")]);
  const mid = await openWith(page, newer);
  const warning = page.getByRole("alert").filter({ hasText: text.autosaveUnknownVersion });
  await expect(warning).toBeVisible();
  await panel(page).getByRole("button", { name: text.addButton }).click();
  await page.mouse.click(mid.x, mid.y);
  await expect(markers(page)).toHaveCount(1);
  await importContents(page, file(1, [point("b", 50.6, 5.6)]));
  await page.waitForTimeout(300);
  expect(await stored(page)).toBe(newer);
  await page.reload();
  await expect(markers(page)).toHaveCount(0);
  expect(await stored(page)).toBe(newer);
});

test("special characters in notes and border positions survive export and import into a fresh profile", async ({ page, browser }) => {
  const notes = ['a/b:c&d<e>"f\'', "emoji 🛶 é ü 日本", "</script><!--", "tab\there"];
  const coords: [number, number][] = [[49.5, 5.8], [50.4, 6.4], [51.5, 4.9], [51.09, 2.55]];
  const pts = notes.map((n, i) => point(`p${i}`, coords[i][0], coords[i][1], n));
  await openWith(page, file(1, pts));
  await expect(markers(page)).toHaveCount(4);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel(page).getByRole("button", { name: text.exportButton }).click(),
  ]);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.accessPoints.map((p: { note: string }) => p.note)).toEqual(notes);
  expect(exported.accessPoints.map((p: { position: { lat: number; lng: number } }) => [p.position.lat, p.position.lng])).toEqual(coords);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await openWith(other);
  await importContents(other, JSON.stringify(exported));
  await expect(markers(other)).toHaveCount(4);
  expect(JSON.parse((await stored(other))!).accessPoints.map((p: { note: string }) => p.note)).toEqual(notes);
  await markers(other).nth(0).click();
  await expect(details(other).getByLabel(text.noteLabel)).toHaveValue(notes[0]);
  await ctx.close();
});

test("a note with special characters typed in the panel is saved and restored", async ({ page }) => {
  const mid = await openWith(page);
  await panel(page).getByRole("button", { name: text.addButton }).click();
  await page.mouse.click(mid.x, mid.y);
  const note = 'Bridge & "pub" <b>x</b> / 100% 🛶';
  await details(page).getByLabel(text.noteLabel).fill(note);
  await page.reload();
  await markers(page).first().click();
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue(note);
});
