// Zoomed out, your access points whose markers would overlap show as one grey marker with their
// count instead of a cramped pile; zoomed in, each has its own marker again. While editing, each
// keeps its own marker to tap and drag. No live service is called.
import { expect, test, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import type { LatLng, Trip } from "../src/core/trip";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { enterAccessPointEditing } from "./support/accessPointEditing";
import { serveOffline } from "./support/offline";
import { mapRegion, points } from "./support/planner";

// Hotton, on the Ourthe: four points within about 300 m.
const hotton: LatLng = { lat: 50.268, lng: 5.446 };
const nearby: LatLng[] = [
  hotton,
  { lat: 50.2685, lng: 5.4465 },
  { lat: 50.2675, lng: 5.4455 },
  { lat: 50.269, lng: 5.447 },
];

const accessPoint = (position: LatLng, i: number): AccessPoint => ({
  id: `ap-${i}`,
  position,
  name: "",
  nameSource: "to-look-up",
  use: "put-in",
  kind: "slipway",
  note: `Point ${i}`,
  checkedOnSite: null,
  createdAt: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
});

/** A trip either side of Hotton, `span` degrees of longitude wide, which sets the zoom. */
const around = (span: number): Trip => ({
  name: "",
  points: [
    { lat: hotton.lat + 0.01, lng: hotton.lng - span / 2 },
    { lat: hotton.lat + 0.01, lng: hotton.lng + span / 2 },
  ],
  legs: [{ mode: "hike" }],
});

const singles = (page: Page) => mapRegion(page).locator(".access-point-marker:not(.access-point-group)");
const groups = (page: Page) => mapRegion(page).locator(".access-point-group");

async function openWith(page: Page, trip: Trip) {
  await serveOffline(page);
  await page.addInitScript(
    ([tripKey, tripValue, key, value]) => {
      localStorage.setItem(tripKey, tripValue);
      localStorage.setItem(key, value);
    },
    [TRIP_KEY, serialiseTrip(trip), ACCESS_POINTS_KEY, serialiseAccessPoints(nearby.map(accessPoint))] as const,
  );
  await page.goto("/");
  await expect(points(page)).toHaveCount(trip.points.length);
  await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
}

test.use({ viewport: { width: 1280, height: 800 } });

test("zoomed out, nearby access points show as one marker with their count", async ({ page }) => {
  await openWith(page, around(1.5));
  await expect(groups(page)).toHaveCount(1);
  await expect(groups(page).getByRole("img", { name: strings.accessPoints.groupMarker(4) })).toBeVisible();
  await expect(singles(page)).toHaveCount(0);
});

test("zoomed in, each access point has its own marker", async ({ page }) => {
  await openWith(page, around(0.01));
  await expect(singles(page)).toHaveCount(4);
  await expect(groups(page)).toHaveCount(0);
});

test("while editing, each access point keeps its own marker to tap and drag", async ({ page }) => {
  await openWith(page, around(1.5));
  await expect(groups(page)).toHaveCount(1);
  await enterAccessPointEditing(page);
  await expect(singles(page)).toHaveCount(4);
  await expect(groups(page)).toHaveCount(0);
});
