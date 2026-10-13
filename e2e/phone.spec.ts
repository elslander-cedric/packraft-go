// Phone layout (#56, ADR 0023): on a small screen the app shows the map, your
// position on request, and your trip read-only. Planning stays on desktop.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

// A phone (the browser itself can't be chosen per file).
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const tripView = (page: Page) => page.getByRole("region", { name: strings.phone.tripLabel });
const showPosition = (page: Page) => page.getByRole("button", { name: strings.phone.showPositionButton });
const positionMarker = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.my-position");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");

const AT_HOTTON = { latitude: 50.268, longitude: 5.446 };

/** A dated two-day trip: hike, paddle, camp, hike, all routed. */
const TRIP: Trip = {
  name: "Ourthe weekend",
  startDate: "2026-10-31",
  points: [
    { lat: 50.26, lng: 5.44 },
    { lat: 50.27, lng: 5.45 },
    { lat: 50.28, lng: 5.46 },
    { lat: 50.29, lng: 5.47 },
  ],
  legs: [
    {
      mode: "hike",
      route: {
        status: "routed",
        geometry: [
          { lat: 50.26, lng: 5.44, elevation: 200 },
          { lat: 50.27, lng: 5.45, elevation: 260 },
        ],
        climbM: 60,
      },
    },
    {
      mode: "paddle",
      route: {
        status: "routed",
        geometry: [
          { lat: 50.27, lng: 5.45, elevation: 260 },
          { lat: 50.28, lng: 5.46, elevation: 240 },
        ],
      },
    },
    {
      mode: "hike",
      route: {
        status: "routed",
        geometry: [
          { lat: 50.28, lng: 5.46, elevation: 240 },
          { lat: 50.29, lng: 5.47, elevation: 300 },
        ],
      },
    },
  ],
  camps: [2],
};

/** Puts a trip in browser storage before the app starts, as if planned earlier. */
async function storeTripBeforeLoad(page: Page, trip: Trip) {
  await page.addInitScript(
    ([key, saved]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, saved);
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

test("a phone shows the map and the trip view, without planning controls", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);

  await expect(tripView(page)).toBeVisible();
  await expect(showPosition(page)).toBeVisible();
  for (const name of [
    strings.newTripButton,
    strings.saveFileButton,
    strings.openFileButton,
    strings.exportGpxButton,
    strings.undoButton,
    strings.deletePointButton,
    strings.campButton,
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("textbox", { name: strings.tripNameLabel })).toHaveCount(0);
  await expect(page.getByLabel(strings.startDateLabel)).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: strings.settingsPanelLabel })).toHaveCount(0);
  // The disclaimer stays visible on the phone.
  await expect(page.getByRole("note")).toContainText(strings.navigationRulesNotice);
});

test("a phone without a trip says where trips are planned", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);
  await expect(tripView(page)).toContainText(strings.phone.tripEmpty);
});

test("the stored trip is shown read-only: legs, days and figures", async ({ page }) => {
  const network = await serveOffline(page);
  await storeTripBeforeLoad(page, TRIP);
  await openPhone(page);

  const view = tripView(page);
  await expect(view.getByRole("heading", { name: "Ourthe weekend" })).toBeVisible();
  await expect(view).toContainText(strings.phone.readOnlyNote);

  const legs = view.getByRole("list", { name: strings.legsPanelLabel }).getByRole("listitem");
  await expect(legs).toHaveCount(3);
  await expect(legs.nth(0)).toContainText(strings.legLabel(1));
  await expect(legs.nth(0)).toContainText(strings.legModeHike);
  await expect(legs.nth(0)).toContainText(`${strings.climbLabel} 60 m`);
  await expect(legs.nth(1)).toContainText(strings.legModePaddle);
  await expect(legs.nth(1)).toContainText(`${strings.dropLabel} 20 m`);
  await expect(legs.nth(0)).toContainText(strings.kilometreUnit);
  // No mode switch: legs can't be changed here.
  await expect(view.getByRole("button")).toHaveCount(0);

  const days = view.getByRole("list", { name: strings.daysPanelLabel }).getByRole("listitem");
  await expect(days).toHaveCount(2);
  await expect(days.nth(0)).toContainText(strings.dayLabel(1));
  await expect(days.nth(0)).toContainText("Sat 31 Oct 2026");
  await expect(days.nth(1)).toContainText("Sun 1 Nov 2026");
  await expect(view).toContainText(strings.tripTotalDistance);

  // The route is drawn on the map.
  await expect(legLines(page)).toHaveCount(3);

  // Tapping the map changes nothing, and nothing is routed.
  const before = await page.evaluate((key) => localStorage.getItem(key), TRIP_KEY);
  const box = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await expect(legLines(page)).toHaveCount(3);
  expect(await page.evaluate((key) => localStorage.getItem(key), TRIP_KEY)).toBe(before);
  expect(network.brouter).toEqual([]);
});

test("'Show my position' explains itself, then shows the position with its accuracy", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...AT_HOTTON, accuracy: 12 });
  await serveOffline(page);
  await openPhone(page);

  // The explanation is visible before the browser asks.
  await expect(page.getByText(strings.phone.positionExplanation)).toBeVisible();
  await expect(positionMarker(page)).toHaveCount(0);

  await showPosition(page).click();

  await expect(positionMarker(page)).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText(strings.phone.positionAccuracy("12 m"));
});

test("a denied location permission shows an explanation and no position", async ({ page, context }) => {
  await context.clearPermissions();
  await serveOffline(page);
  await openPhone(page);
  // Chromium answers without asking when the permission was never granted; make the denial explicit.
  await page.evaluate(() => {
    const denied = { code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    navigator.geolocation.watchPosition = (_success, failure) => {
      failure?.(denied as GeolocationPositionError);
      return 0;
    };
    navigator.geolocation.getCurrentPosition = (_success, failure) => failure?.(denied as GeolocationPositionError);
  });

  await showPosition(page).click();

  await expect(page.getByRole("alert").filter({ hasText: strings.phone.positionDenied })).toBeVisible();
  await expect(positionMarker(page)).toHaveCount(0);
});

test("a wide screen still gets the desktop planner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await serveOffline(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: strings.newTripButton })).toBeVisible();
  await expect(showPosition(page)).toHaveCount(0);
});
