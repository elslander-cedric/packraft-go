// #156: the phone's Access points tab while the trip has a route. The points within
// 200 m of the route come first in route order ("km 2.3 · Your put-in"); the rest
// follow, nearest to you once your position is shown, else nearest to the route.
// The legs are stored routed, so nothing is routed: no live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import type { LatLng, Trip } from "../src/core/trip";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const text = strings.planner;

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const section = (page: Page) => sheet(page).getByRole("region", { name: text.accessPointsLabel, exact: true });
const list = (page: Page, name: string) => section(page).getByRole("list", { name, exact: true });
/** Each row's own button (before its edit and delete buttons) reads its heading, then its figure. */
const rowsOf = (page: Page, name: string) => list(page, name).locator(".planner-access-point-row");

// Hotton to the north-east: a hike leg, then a paddle leg, about 2.3 and 2.6 km.
const P: LatLng[] = [
  { lat: 50.27, lng: 5.44 },
  { lat: 50.29, lng: 5.45 },
  { lat: 50.31, lng: 5.47 },
];
const straight = (a: LatLng, b: LatLng) =>
  Array.from({ length: 11 }, (_, i) => ({
    lat: a.lat + ((b.lat - a.lat) * i) / 10,
    lng: a.lng + ((b.lng - a.lng) * i) / 10,
    elevation: 200,
  }));
const TRIP: Trip = {
  name: "Ourthe",
  points: P,
  legs: [
    { mode: "hike", route: { status: "routed", geometry: straight(P[0], P[1]) } },
    { mode: "paddle", route: { status: "routed", geometry: straight(P[1], P[2]) } },
  ],
};

const T = "2026-10-12T08:00:00.000Z";
const point = (id: string, name: string, lat: number, lng: number): AccessPoint => ({
  id,
  position: { lat, lng },
  name,
  nameSource: "typed",
  use: "both",
  kind: "slipway",
  note: "",
  checkedOnSite: null,
  createdAt: T,
  updatedAt: T,
});
// Stored out of order on purpose.
const POINTS = [
  point("far", "Durbuy jetty", 50.4, 5.6),
  point("end", "Hotton bridge", 50.31, 5.47),
  point("put", "Rue du Moulin", 50.29, 5.45),
  point("mid", "Mill weir", 50.3001, 5.4605),
  point("ford", "Marche ford", 50.2, 5.3),
  point("car", "Forest car park", 50.28, 5.4452),
  point("bank", "Campsite bank", 50.33, 5.5),
];

async function openWithTrip(page: Page) {
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [
      [TRIP_KEY, serialiseTrip(TRIP)],
      [ACCESS_POINTS_KEY, serialiseAccessPoints(POINTS)],
    ] as const,
  );
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await sheet(page).getByRole("tab", { name: text.tabs.accessPoints }).click();
}

test("on the route first in route order, then the rest nearest the route until my position is shown", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 50.39, longitude: 5.58, accuracy: 15 });
  await openWithTrip(page);

  await expect(section(page).getByRole("heading")).toHaveText([text.onRouteHeading, text.notOnRouteHeading]);
  await expect(rowsOf(page, text.onRouteHeading)).toHaveText([
    /^Forest car park\s*km 1\.2/,
    new RegExp(`^Rue du Moulin\\s*km 2\\.3 · ${text.yourPutIn}`),
    /^Mill weir\s*km 3\.7/,
    new RegExp(`^Hotton bridge\\s*km 5\\.0 · ${text.yourTakeOut}`),
  ]);
  // No position yet: nearest to the route first, without a distance from me.
  await expect(rowsOf(page, text.notOnRouteHeading)).toHaveText([/^Campsite bank/, /^Marche ford/, /^Durbuy jetty/]);
  await expect(list(page, text.notOnRouteHeading)).not.toContainText("from you");

  await page.getByRole("button", { name: text.showPositionButton }).click();
  await expect(rowsOf(page, text.notOnRouteHeading)).toHaveText([
    /^Durbuy jetty\s*1\.8 km from you/,
    /^Campsite bank\s*8\.8 km from you/,
    /^Marche ford\s*29\.0 km from you/,
  ]);
});

test("rows run edge to edge like the legs, and a selected row keeps its background", async ({ page }) => {
  await openWithTrip(page);
  const rows = rowsOf(page, text.onRouteHeading);
  await expect(rows).toHaveCount(4);

  const sheetBox = (await sheet(page).boundingBox())!;
  const rowBox = (await rows.first().boundingBox())!;
  expect(rowBox.x).toBeCloseTo(sheetBox.x, 0);

  const background = (n: number) => rows.nth(n).evaluate((el) => getComputedStyle(el).backgroundColor);
  const before = await background(1);
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
  // Still hovered after the tap, and still the same background as the others.
  expect(await background(1)).toBe(before);
  expect(await background(0)).toBe(before);
});

test("none on the route says so, and the rest still follow", async ({ page }) => {
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [
      [TRIP_KEY, serialiseTrip(TRIP)],
      [ACCESS_POINTS_KEY, serialiseAccessPoints([point("far", "Durbuy jetty", 50.4, 5.6)])],
    ] as const,
  );
  await serveOffline(page);
  await page.goto("/");
  await sheet(page).getByRole("tab", { name: text.tabs.accessPoints }).click();

  await expect(section(page)).toContainText(text.noneOnRoute);
  await expect(rowsOf(page, text.notOnRouteHeading)).toHaveText([/^Durbuy jetty/]);
});
