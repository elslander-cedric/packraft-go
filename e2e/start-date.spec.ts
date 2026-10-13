// Trip start date (#52): set, change and clear it in the trip toolbar; day rows
// show their dates; the date survives a reload and a save/open file round-trip.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const daysPanel = (page: Page) => page.getByRole("complementary", { name: strings.daysPanelLabel });
const dayRows = (page: Page) => daysPanel(page).getByRole("listitem");
const startDate = (page: Page) => page.getByLabel(strings.startDateLabel);
const clearDateButton = (page: Page) => page.getByRole("button", { name: strings.clearStartDateButton });
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Draws three points and makes the middle one a camp: a two-day trip. */
async function drawTwoDays(page: Page) {
  await page.goto("/");
  await waitForMap(page);
  const box = (await mapRegion(page).boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const dx of [-150, 0, 150]) await page.mouse.click(middle.x + dx, middle.y);
  await page.mouse.click(middle.x, middle.y); // select the middle point
  await campButton(page).click();
  await expect(dayRows(page)).toHaveCount(2);
}

test("set, change and clear a start date; day rows show their dates", async ({ page }) => {
  await serveOffline(page);
  await drawTwoDays(page);
  await expect(startDate(page)).toHaveValue("");
  await expect(daysPanel(page).locator(".day-date")).toHaveCount(0);
  await expect(clearDateButton(page)).toHaveCount(0);

  await startDate(page).fill("2026-10-31");
  await expect(dayRows(page).nth(0)).toContainText(`${strings.dayLabel(1)} Sat 31 Oct 2026`);
  await expect(dayRows(page).nth(1)).toContainText(`${strings.dayLabel(2)} Sun 1 Nov 2026`);

  await startDate(page).fill("2026-12-31");
  await expect(dayRows(page).nth(0)).toContainText("Thu 31 Dec 2026");
  await expect(dayRows(page).nth(1)).toContainText("Fri 1 Jan 2027");

  await clearDateButton(page).click();
  await expect(startDate(page)).toHaveValue("");
  await expect(daysPanel(page).locator(".day-date")).toHaveCount(0);
  await expect(dayRows(page)).toHaveCount(2);
});

test("the start date survives a reload and is autosaved as version 1", async ({ page }) => {
  const network = await serveOffline(page);
  await drawTwoDays(page);
  await startDate(page).fill("2026-10-31");
  await expect(dayRows(page).nth(1)).toContainText("Sun 1 Nov 2026");

  const stored = await page.evaluate(() => localStorage.getItem("packraft-go.trip"));
  expect(JSON.parse(stored!)).toMatchObject({ version: 1, trip: { startDate: "2026-10-31", camps: [1] } });

  await page.reload();
  await waitForMap(page);
  await expect(startDate(page)).toHaveValue("2026-10-31");
  await expect(dayRows(page).nth(0)).toContainText("Sat 31 Oct 2026");
  await expect(dayRows(page).nth(1)).toContainText("Sun 1 Nov 2026");
  expect(network.blocked).toEqual([]);
});

test("the start date survives save to file and open file", async ({ page }) => {
  await serveOffline(page);
  await drawTwoDays(page);
  await startDate(page).fill("2026-10-31");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.saveFileButton }).click(),
  ]);
  const path = (await download.path())!;
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
    format: "packraft-go-trip",
    version: 1,
    trip: { startDate: "2026-10-31" },
  });

  await page.getByRole("button", { name: strings.newTripButton }).click();
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(startDate(page)).toHaveValue("");
  await expect(dayRows(page)).toHaveCount(0);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: strings.openFileButton }).click(),
  ]);
  await chooser.setFiles(path);
  await expect(startDate(page)).toHaveValue("2026-10-31");
  await expect(dayRows(page).nth(0)).toContainText("Sat 31 Oct 2026");
  await expect(dayRows(page).nth(1)).toContainText("Sun 1 Nov 2026");
});

test("an old version 2 trip file is refused as an unknown version", async ({ page }) => {
  await serveOffline(page);
  await drawTwoDays(page);
  await startDate(page).fill("2026-10-31");
  const old = JSON.stringify({
    format: "packraft-go-trip",
    version: 2,
    trip: { name: "Old", points: [{ lat: 50, lng: 5 }], legs: [] },
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: strings.openFileButton }).click(),
  ]);
  await chooser.setFiles({ name: "old.packraft.json", mimeType: "application/json", buffer: Buffer.from(old) });
  await expect(page.getByRole("alert").filter({ hasText: strings.openFileUnknownVersion })).toBeVisible();
  await expect(startDate(page)).toHaveValue("2026-10-31");
  await expect(dayRows(page)).toHaveCount(2);
});
