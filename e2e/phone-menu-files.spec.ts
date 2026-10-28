// The phone menu and files (#124, spec #114 stories 54–60): a floating menu top
// left with New trip, Save…, Open… and Export GPX…. Save and Export ask for the
// trip name first; New trip and Open… ask before losing points, as on desktop.
// Also restores the phone's open-a-trip-file coverage (first #71).
import { readFile } from "node:fs/promises";
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { parseGpx11 } from "../src/testing/gpx11";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { downloadGpxZip } from "./support/gpxZip";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.phone.menu;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: strings.phone.sheetLabel });
const tripHeading = (page: Page, name: string) => sheet(page).getByRole("heading", { name, exact: true });
const menuButton = (page: Page) => page.getByRole("button", { name: text.button });
const menuItem = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const nameDialog = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), TRIP_KEY);
const storedTrip = async (page: Page) => JSON.parse((await stored(page))!).trip as Trip;

/** A routed one-leg hike trip, ending just west of the 180th meridian. */
const routedTrip = (name: string, lng = 5.44): Trip => ({
  name,
  points: [
    { lat: 50.26, lng },
    { lat: 50.27, lng: lng + 0.00999999 },
  ],
  legs: [
    {
      mode: "hike",
      route: {
        status: "routed",
        geometry: [
          { lat: 50.26, lng, elevation: 200 },
          { lat: 50.27, lng: lng + 0.00999999, elevation: 260 },
        ],
      },
    },
  ],
});
const OURTHE = routedTrip("Ourthe weekend");
const LESSE = routedTrip("Lesse day");

/** Stores `trip` before the first load only, so reloads show what the app saved. */
async function seed(page: Page, trip: Trip) {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "yes");
      }
    },
    [TRIP_KEY, serialiseTrip(trip)] as const,
  );
}

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

async function choose(page: Page, name: string) {
  await menuButton(page).click();
  await menuItem(page, name).click();
}

async function openFile(page: Page, content: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), choose(page, text.openFile)]);
  await chooser.setFiles({ name: "trip.json", mimeType: "application/json", buffer: Buffer.from(content) });
}

test("the menu sits top left with New trip, Save…, Open…, Export GPX… and Settings…", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);
  const button = (await menuButton(page).boundingBox())!;
  expect(button.x).toBeLessThan(viewport.width / 4);
  expect(button.y).toBeLessThan(viewport.height / 4);
  expect(button.width).toBeGreaterThanOrEqual(44);

  await menuButton(page).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    text.newTrip,
    text.saveFile,
    text.openFile,
    text.exportGpx,
    text.settings,
  ]);
  // Nothing to export without a leg.
  await expect(menuItem(page, text.exportGpx)).toHaveAttribute("aria-disabled", "true");
});

test("New trip asks first when there are points, then starts with today in Brussels as its start date", async ({
  browser,
}) => {
  // In New York it is still 25 October; in Brussels it is already the 26th.
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    timezoneId: "America/New_York",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-25T23:30:00Z"));
  await serveOffline(page);
  await seed(page, OURTHE);
  await openPhone(page);
  await expect(tripHeading(page, "Ourthe weekend")).toBeVisible();

  await choose(page, text.newTrip);
  await answerConfirmation(page, "newTrip", "cancel");
  await expect(tripHeading(page, "Ourthe weekend")).toBeVisible();
  expect((await storedTrip(page)).points).toHaveLength(2);

  await choose(page, text.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  // A new, unnamed trip shows no name in the sheet.
  await expect(sheet(page).getByRole("heading")).toHaveCount(0);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(0);
  await expect.poll(async () => (await storedTrip(page)).startDate).toBe("2026-10-26");
  expect((await storedTrip(page)).points).toEqual([]);

  // A trip without points is replaced without asking, again dated today.
  await choose(page, text.newTrip);
  await expect(confirmDialog(page)).toHaveCount(0);
  expect((await storedTrip(page)).startDate).toBe("2026-10-26");
  await context.close();
});

test("Open… replaces the trip after the same question as on desktop, and it survives a reload", async ({ page }) => {
  const network = await serveOffline(page);
  await seed(page, OURTHE);
  await openPhone(page);

  await openFile(page, serialiseTrip(LESSE));
  await answerConfirmation(page, "openFile", "cancel");
  await expect(tripHeading(page, "Ourthe weekend")).toBeVisible();

  await openFile(page, serialiseTrip(LESSE));
  await answerConfirmation(page, "openFile", "confirm");
  await expect(tripHeading(page, "Lesse day")).toBeVisible();
  await expect(mapRegion(page).locator(".leaflet-overlay-pane path.leg")).toHaveCount(1);

  await page.reload();
  await expect(tripHeading(page, "Lesse day")).toBeVisible();
  // The opened trip keeps its routes: nothing is routed again.
  expect(network.brouter).toEqual([]);
});

test("Open… with a file that isn't a trip file shows why and keeps the trip", async ({ page }) => {
  await serveOffline(page);
  await seed(page, OURTHE);
  await openPhone(page);
  const before = await stored(page);

  await openFile(page, "{}");
  await expect(page.getByRole("alert").filter({ hasText: strings.openFileInvalid })).toBeVisible();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(await stored(page)).toBe(before);
});

test("Save… asks for the name, prefilled; the file and the trip take the name from the dialog", async ({ page }) => {
  await serveOffline(page);
  await seed(page, OURTHE);
  await openPhone(page);

  // Cancel changes nothing.
  await choose(page, text.saveFile);
  const dialog = nameDialog(page, text.saveTitle);
  await expect(dialog.getByRole("textbox", { name: strings.tripNameLabel })).toHaveValue("Ourthe weekend");
  await dialog.getByRole("button", { name: strings.confirmCancel }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tripHeading(page, "Ourthe weekend")).toBeVisible();

  const name = "Lesse / day: 1 & <2>\u0007";
  await choose(page, text.saveFile);
  await dialog.getByRole("textbox", { name: strings.tripNameLabel }).fill(name);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: text.saveConfirm }).click(),
  ]);
  await expect(dialog).toHaveCount(0);

  expect(download.suggestedFilename()).toBe("Lesse - day- 1 & -2-.packraft.json");
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved.trip.name).toBe(name);
  await expect(tripHeading(page, name)).toBeVisible();

  // The renamed trip is autosaved on the device.
  await page.reload();
  await expect(tripHeading(page, name)).toBeVisible();
});

test("Export GPX… asks for the name; the GPX files are well-formed, named from it, and stay below 180°", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, routedTrip("Ourthe", 179.99));
  await openPhone(page);

  await choose(page, text.exportGpx);
  const dialog = nameDialog(page, text.exportTitle);
  const field = dialog.getByRole("textbox", { name: strings.tripNameLabel });
  await expect(field).toHaveValue("Ourthe");
  await field.fill("Tom & Jerry: <Semois>/\u0001 trip");
  // Enter confirms, like the button.
  const zip = await downloadGpxZip(page, () => field.press("Enter"));

  expect(zip.name).toBe("Tom & Jerry- -Semois- trip.zip");
  expect(zip.files.map((file) => file.name)).toEqual(["Tom & Jerry- -Semois- trip – 1 – hike.gpx"]);
  const gpx = parseGpx11(zip.files[0].text);
  expect(gpx.metadataName).toBe("Tom & Jerry: <Semois>/ trip – 1 – hike");
  expect(gpx.tracks[0].name).toBe(gpx.metadataName);
  for (const point of gpx.tracks[0].points) expect(point.lon).toBeLessThan(180);
  await expect(tripHeading(page, "Tom & Jerry: <Semois>/\u0001 trip")).toBeVisible();
  expect((await storedTrip(page)).name).toBe("Tom & Jerry: <Semois>/\u0001 trip");
});
