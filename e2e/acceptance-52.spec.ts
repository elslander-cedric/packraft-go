// Acceptance tests for #52: trip start date and save format reset
// (ADR 0011 amendment "format reset", ADR 0022). Written from the issue and
// spec #51 before reading the diff. Ported to the one planner (ADR 0034): the start date is
// set in the Edit trip dialog, and each day card's tile is named by its date.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";
import { todayInBrussels } from "../src/core/calendarDate";
import {
  dayCardDates,
  dayCards,
  expectTripName,
  freeMapBox,
  menuItem,
  openPlanner,
  openTripFile,
  saveTripFile,
  setStartDate,
  showTab,
  shownStartDate,
  tripDetailsDialog,
  tripPanel,
} from "./support/planner";

const TRIP_KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
/** The Days tab's cards; shows the tab first. */
const dayRows = async (page: Page) => {
  await showTab(page, strings.planner.tabs.days);
  return dayCards(page);
};
const dayDates = dayCardDates;
const dayDateTimes = async (page: Page) =>
  (await dayRows(page)).locator(".day-tile time").evaluateAll((times) => times.map((t) => t.getAttribute("datetime")));
const startDate = (page: Page) => tripDetailsDialog(page).getByLabel(strings.startDateLabel);
const clearDate = (page: Page) => tripDetailsDialog(page).getByRole("button", { name: strings.clearStartDateButton });
const saveDetails = (page: Page) =>
  tripDetailsDialog(page).getByRole("button", { name: strings.planner.menu.tripDetailsConfirm });
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });
/** Menu → Edit trip: the dialog with the start date, left open. */
const openDetails = (page: Page) => menuItem(page, strings.planner.menu.tripDetails);
const autosaveWarning = (page: Page) => page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion });
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), TRIP_KEY);
const storedJson = async (page: Page) => JSON.parse((await stored(page)) ?? "{}");

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(tripPanel(page)).toBeVisible();
}

/** Draws four points with camps on the two inner ones: a three-day trip. */
async function drawThreeDays(page: Page) {
  await openPlanner(page);
  const box = (await freeMapBox(page));
  const at = (dx: number) => ({ x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 });
  for (const dx of [-180, -60, 60, 180]) await page.mouse.click(at(dx).x, at(dx).y);
  for (const dx of [-60, 60]) {
    await page.mouse.click(at(dx).x, at(dx).y);
    await campButton(page).click();
  }
  await expect(await dayRows(page)).toHaveCount(3);
}

/** Types a date into the native date field with the keyboard, whatever its segment order (d/m/y or m/d/y). */
async function typeDate(page: Page, day: string, month: string, year: string) {
  const field = startDate(page);
  // Probe the order with 12/01: m/d/y gives December, d/m/y gives January.
  await field.focus();
  await page.keyboard.type("12012000");
  const dayFirst = (await field.inputValue()) === "2000-01-12";
  await field.blur();
  await field.focus(); // back on the first segment
  await page.keyboard.type(dayFirst ? `${day}${month}${year}` : `${month}${day}${year}`);
}

const save = (version: unknown, trip: object) => JSON.stringify({ format: "packraft-go-trip", version, trip });
const threePoints = {
  name: "Seeded",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
    { lat: 50.32, lng: 5.62 },
  ],
  legs: [{ mode: "hike" }, { mode: "paddle" }],
  camps: [1],
};

async function openFile(page: Page, text: string) {
  await openTripFile(page, { name: "t.packraft.json", mimeType: "application/json", buffer: Buffer.from(text) });
}

// A date picked in the browser must not shift by a day, whatever the zone.
for (const timezoneId of ["Europe/Brussels", "Pacific/Kiritimati", "America/Los_Angeles"]) {
  test.describe(`in ${timezoneId}`, () => {
    test.use({ timezoneId, locale: "en-US" });

    test("a date typed into the field shows on the day cards unshifted, across DST and month ends", async ({ page }) => {
      await serveOffline(page);
      await drawThreeDays(page);
      // Type it like a user, segment by segment, in the field's own order.
      await openDetails(page);
      await typeDate(page, "24", "10", "2026");
      await expect(startDate(page)).toHaveValue("2026-10-24");
      await saveDetails(page).click();
      await expect.poll(() => dayDates(page)).toEqual(["Sat 24 Oct 2026", "Sun 25 Oct 2026", "Mon 26 Oct 2026"]);
      expect((await dayDateTimes(page))[1]).toBe("2026-10-25");
      await expect.poll(async () => (await storedJson(page)).trip?.startDate).toBe("2026-10-24");

      await setStartDate(page, "2026-03-28");
      await expect.poll(() => dayDates(page)).toEqual(["Sat 28 Mar 2026", "Sun 29 Mar 2026", "Mon 30 Mar 2026"]);

      await setStartDate(page, "2028-02-28");
      await expect.poll(() => dayDates(page)).toEqual(["Mon 28 Feb 2028", "Tue 29 Feb 2028", "Wed 1 Mar 2028"]);

      await page.reload();
      await waitForMap(page);
      expect(await shownStartDate(page)).toBe("2028-02-28");
      await expect.poll(() => dayDates(page)).toEqual(["Mon 28 Feb 2028", "Tue 29 Feb 2028", "Wed 1 Mar 2028"]);
    });
  });
}

test("clearing by emptying the field removes the dates and the saved start date, and survives reload", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-12-30");
  await expect.poll(() => dayDates(page)).toEqual(["Wed 30 Dec 2026", "Thu 31 Dec 2026", "Fri 1 Jan 2027"]);
  await expect.poll(async () => (await storedJson(page)).trip?.startDate).toBe("2026-12-30");

  await openDetails(page);
  await startDate(page).fill("");
  await expect(clearDate(page)).toHaveCount(0);
  await saveDetails(page).click();
  await expect.poll(() => dayDates(page)).toEqual([]);
  await expect(await dayRows(page)).toHaveCount(3);
  await expect.poll(async () => (await storedJson(page)).trip).not.toHaveProperty("startDate");

  await page.reload();
  await waitForMap(page);
  expect(await shownStartDate(page)).toBe("");
  expect(await dayDates(page)).toEqual([]);
});

test("the Clear date button clears; clearing and setting again works; reload keeps it undated", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-10-31");
  await openDetails(page);
  await clearDate(page).click();
  await expect(startDate(page)).toHaveValue("");
  await expect(clearDate(page)).toHaveCount(0);
  await saveDetails(page).click();
  await expect.poll(() => dayDates(page)).toEqual([]);
  await setStartDate(page, "2026-11-01");
  await expect.poll(() => dayDates(page)).toEqual(["Sun 1 Nov 2026", "Mon 2 Nov 2026", "Tue 3 Nov 2026"]);
  await setStartDate(page, "");
  await expect.poll(async () => (await storedJson(page)).trip).not.toHaveProperty("startDate");
  await page.reload();
  await waitForMap(page);
  expect(await dayDates(page)).toEqual([]);
});

test("camps and dates stay in line when camps change and on undo", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-10-31");
  await expect.poll(() => dayDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026", "Mon 2 Nov 2026"]);
  await expect((await dayRows(page)).nth(1)).toContainText(strings.legRange(2, 2));

  // Select the second point and remove its camp.
  const box = (await freeMapBox(page));
  await page.mouse.click(box.x + box.width / 2 - 60, box.y + box.height / 2);
  await campButton(page).click();
  await expect(await dayRows(page)).toHaveCount(2);
  await expect.poll(() => dayDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026"]);
  await expect((await dayRows(page)).nth(1)).toContainText(strings.legRange(3, 3));

  await undoButton(page).click();
  await expect(await dayRows(page)).toHaveCount(3);
  await expect.poll(() => dayDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026", "Mon 2 Nov 2026"]);
  expect(await shownStartDate(page)).toBe("2026-10-31");
});

// Updated for ADR 0034: the one planner's New trip starts on today in Brussels (#124), not undated.
test("a new trip starts on today in Brussels", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-10-31");
  await menuItem(page, strings.planner.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  const today = todayInBrussels(new Date());
  expect(await shownStartDate(page)).toBe(today);
  await expect.poll(async () => (await storedJson(page)).trip?.startDate).toBe(today);
});

test("save file is version 1 with the start date and equals the autosave", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-10-31");
  await expect.poll(async () => (await storedJson(page)).trip?.startDate).toBe("2026-10-31");
  const download = await saveTripFile(page);
  const text = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(text)).toMatchObject({ version: 1, trip: { startDate: "2026-10-31", camps: [1, 2] } });
  expect(text).toBe(await stored(page));
});

test("a version 1 file with a start date opens with its dates", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  await openFile(page, save(1, { ...threePoints, startDate: "2026-12-31" }));
  await expectTripName(page, "Seeded");
  expect(await shownStartDate(page)).toBe("2026-12-31");
  await expect.poll(() => dayDates(page)).toEqual(["Thu 31 Dec 2026", "Fri 1 Jan 2027"]);
});

for (const version of [2, 0, 3]) {
  test(`an autosave in version ${version} (with a start date) gets #28's warning and is not overwritten by date edits`, async ({
    page,
  }) => {
    await serveOffline(page);
    const old = save(version, { ...threePoints, startDate: "2026-10-31" });
    await openPlanner(page);
    await page.evaluate(([key, text]) => localStorage.setItem(key, text), [TRIP_KEY, old]);
    await page.reload();
    await waitForMap(page);
    await expect(autosaveWarning(page)).toBeVisible();
    expect(await shownStartDate(page)).toBe("");
    await setStartDate(page, "2027-01-01");
    await page.waitForTimeout(300);
    expect(await stored(page)).toBe(old);
    await page.reload();
    await waitForMap(page);
    await expect(autosaveWarning(page)).toBeVisible();
    expect(await stored(page)).toBe(old);
  });
}

test("a version 1 file with a damaged start date is refused as damaged and the trip stays", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-10-31");
  await expect.poll(async () => (await storedJson(page)).trip?.startDate).toBe("2026-10-31");
  const before = await stored(page);
  await openFile(page, save(1, { ...threePoints, startDate: "2026-02-30" }));
  await expect(alertWith(page, strings.openFileInvalid)).toBeVisible();
  await expect(alertWith(page, strings.openFileUnknownVersion)).toHaveCount(0);
  expect(await shownStartDate(page)).toBe("2026-10-31");
  await expect(await dayRows(page)).toHaveCount(3);
  expect(await stored(page)).toBe(before);
});

test("an old version 2 file with a start date is refused as unknown version and the trip stays", async ({ page }) => {
  await serveOffline(page);
  await drawThreeDays(page);
  await setStartDate(page, "2026-10-31");
  await expect.poll(async () => (await storedJson(page)).trip?.startDate).toBe("2026-10-31");
  const before = await stored(page);
  await openFile(page, save(2, { ...threePoints, startDate: "2027-05-01" }));
  await expect(alertWith(page, strings.openFileUnknownVersion)).toBeVisible();
  expect(await shownStartDate(page)).toBe("2026-10-31");
  await expect.poll(() => dayDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026", "Mon 2 Nov 2026"]);
  expect(await stored(page)).toBe(before);
});
