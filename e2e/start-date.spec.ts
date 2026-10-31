// Trip start date (#52): set, change and clear it in the Edit trip dialog (ADR 0034); day
// cards show their dates; the date survives a reload and a save/open file round-trip.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";
import { todayInBrussels } from "../src/core/calendarDate";
import {
  dayCardDates,
  dayCards,
  freeMapBox,
  menuItem,
  openPlanner,
  openTripFile,
  saveTripFile,
  setStartDate,
  showTab,
  shownStartDate,
  tripDetailsDialog,
} from "./support/planner";

/** The Days tab's cards; shows the tab first. */
const dayRows = async (page: Page) => {
  await showTab(page, strings.planner.tabs.days);
  return dayCards(page);
};
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });

/** Draws three points and makes the middle one a camp: a two-day trip. */
async function drawTwoDays(page: Page) {
  await openPlanner(page);
  const box = (await freeMapBox(page));
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const dx of [-150, 0, 150]) await page.mouse.click(middle.x + dx, middle.y);
  await page.mouse.click(middle.x, middle.y); // select the middle point
  await campButton(page).click();
  await expect(await dayRows(page)).toHaveCount(2);
}

test("set, change and clear a start date; day cards show their dates", async ({ page }) => {
  await serveOffline(page);
  await drawTwoDays(page);
  expect(await shownStartDate(page)).toBe("");
  expect(await dayCardDates(page)).toEqual([]);
  await menuItem(page, strings.planner.menu.tripDetails);
  await expect(tripDetailsDialog(page).getByRole("button", { name: strings.clearStartDateButton })).toHaveCount(0);
  await tripDetailsDialog(page).getByRole("button", { name: strings.confirmCancel }).click();

  await setStartDate(page, "2026-10-31");
  await expect.poll(() => dayCardDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026"]);

  await setStartDate(page, "2026-12-31");
  await expect.poll(() => dayCardDates(page)).toEqual(["Thu 31 Dec 2026", "Fri 1 Jan 2027"]);

  // The dialog's Clear date button.
  await setStartDate(page, "");
  expect(await shownStartDate(page)).toBe("");
  expect(await dayCardDates(page)).toEqual([]);
  await expect(await dayRows(page)).toHaveCount(2);
});

test("the start date survives a reload and is autosaved as version 1", async ({ page }) => {
  const network = await serveOffline(page);
  await drawTwoDays(page);
  await setStartDate(page, "2026-10-31");
  await expect.poll(() => dayCardDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026"]);

  const stored = await page.evaluate(() => localStorage.getItem("packraft-go.trip"));
  expect(JSON.parse(stored!)).toMatchObject({ version: 1, trip: { startDate: "2026-10-31", camps: [1] } });

  await page.reload();
  await openPlanner(page);
  expect(await shownStartDate(page)).toBe("2026-10-31");
  expect(await dayCardDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026"]);
  expect(network.blocked).toEqual([]);
});

test("the start date survives save to file and open file", async ({ page }) => {
  await serveOffline(page);
  await drawTwoDays(page);
  await setStartDate(page, "2026-10-31");

  const download = await saveTripFile(page);
  const path = (await download.path())!;
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
    format: "packraft-go-trip",
    version: 1,
    trip: { startDate: "2026-10-31" },
  });

  // Updated for ADR 0034: a new trip starts on today in Brussels.
  await menuItem(page, strings.planner.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  expect(await shownStartDate(page)).toBe(todayInBrussels(new Date()));
  await expect(await dayRows(page)).toHaveCount(0);

  await openTripFile(page, path);
  await expect.poll(() => shownStartDate(page)).toBe("2026-10-31");
  expect(await dayCardDates(page)).toEqual(["Sat 31 Oct 2026", "Sun 1 Nov 2026"]);
});

test("an old version 2 trip file is refused as an unknown version", async ({ page }) => {
  await serveOffline(page);
  await drawTwoDays(page);
  await setStartDate(page, "2026-10-31");
  const old = JSON.stringify({
    format: "packraft-go-trip",
    version: 2,
    trip: { name: "Old", points: [{ lat: 50, lng: 5 }], legs: [] },
  });
  await openTripFile(page, { name: "old.packraft.json", mimeType: "application/json", buffer: Buffer.from(old) });
  await expect(page.getByRole("alert").filter({ hasText: strings.openFileUnknownVersion })).toBeVisible();
  expect(await shownStartDate(page)).toBe("2026-10-31");
  await expect(await dayRows(page)).toHaveCount(2);
});
