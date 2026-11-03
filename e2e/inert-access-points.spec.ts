// Your access points don't react in normal mode (ADR 0036, #226): no tap, no drag; a press passes
// through to the route point, leg or map under it. In access point editing they can be tapped
// and dragged. Official aires open their details in both modes. On a wide screen (mouse) and on
// a phone (touch). The touch drag of a route point snapped onto an access point is in
// phone-point-editing.spec.ts; accepting a snap offer onto your access point in snap-aire.spec.ts.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import type { LatLng, Trip } from "../src/core/trip";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { enterAccessPointEditing, leaveAccessPointEditing } from "./support/accessPointEditing";
import { toggleAccessLayer } from "./support/mapMenu";
import { serveOffline } from "./support/offline";
import { mapOffset, mapRegion, points, settled } from "./support/planner";

// Hotton, on the Ourthe. 0.0005 degrees of latitude is about 55 m.
const start: LatLng = { lat: 50.268, lng: 5.446 };
const north: LatLng = { lat: 50.2685, lng: 5.446 };

const slipway = (at: LatLng): AccessPoint => ({
  id: "ap-1",
  position: at,
  name: "",
  nameSource: "to-look-up",
  use: "put-in",
  kind: "slipway",
  note: "Hotton slipway",
  checkedOnSite: null,
  createdAt: "2026-05-01T08:00:00.000Z",
  updatedAt: "2026-05-01T08:00:00.000Z",
});

const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const storedTrip = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.trip, TRIP_KEY);
const storedAccessPoint = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.accessPoints?.[0]?.position, ACCESS_POINTS_KEY);

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Opens the planner on a trip of one point at `start`, with your access point at `accessAt`. */
async function openWith(page: Page, accessAt: LatLng) {
  const network = await serveOffline(page);
  const trip: Trip = { name: "", points: [start], legs: [] };
  await page.addInitScript(
    ([tripKey, tripValue, key, value]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(tripKey, tripValue);
      localStorage.setItem(key, value);
    },
    [TRIP_KEY, serialiseTrip(trip), ACCESS_POINTS_KEY, serialiseAccessPoints([slipway(accessAt)])] as const,
  );
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(points(page)).toHaveCount(1);
  await expect(markers(page)).toHaveCount(1);
  // Let the map settle on the trip before measuring.
  await expect(mapRegion(page).locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await settled(async () => [await mapOffset(page), await centreOf(markers(page).first())]);
  return network;
}

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a mouse drag on a route point snapped onto an access point moves the route point only", async ({ page }) => {
    const network = await openWith(page, start);
    const at = await centreOf(points(page).first());
    const marker = await centreOf(markers(page).first());
    expect(Math.abs(marker.x - at.x)).toBeLessThan(3);
    expect(Math.abs(marker.y - at.y)).toBeLessThan(3);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 40, at.y + 60, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await storedTrip(page))?.points?.[0]).not.toEqual(start);
    const after = await centreOf(markers(page).first());
    expect(Math.abs(after.x - at.x)).toBeLessThan(3);
    expect(Math.abs(after.y - at.y)).toBeLessThan(3);
    expect(await storedAccessPoint(page)).toEqual(start);
    expect(network.blocked).toEqual([]);
  });

  test("a click on an access point with nothing else under it adds a route point; dragging it moves nothing", async ({
    page,
  }) => {
    await openWith(page, north);
    const marker = markers(page).first();
    await expect(marker).not.toHaveClass(/access-point-selected/);
    const at = await centreOf(marker);
    await page.mouse.click(at.x, at.y);
    await expect(points(page)).toHaveCount(2);
    await expect(marker).not.toHaveClass(/access-point-selected/);

    // A press and drag on it pans the map; the access point stays where it was.
    await page.waitForTimeout(450); // not a double click
    const from = await centreOf(marker);
    await page.mouse.move(from.x + 10, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(from.x + 90, from.y + 70, { steps: 8 });
    await page.mouse.up();
    expect(await storedAccessPoint(page)).toEqual(north);
  });

  test("in access point editing a click selects your access point and a drag moves it", async ({ page }) => {
    await openWith(page, north);
    await enterAccessPointEditing(page);
    const marker = markers(page).first();
    const at = await centreOf(marker);
    await page.mouse.click(at.x, at.y);
    await expect(marker).toHaveClass(/access-point-selected/);
    await expect(points(page)).toHaveCount(1);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 60, at.y - 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => storedAccessPoint(page)).not.toEqual(north);

    // Done: inert again.
    await leaveAccessPointEditing(page);
    const moved = await storedAccessPoint(page);
    const now = await centreOf(marker);
    await page.mouse.click(now.x, now.y);
    await expect(points(page)).toHaveCount(2);
    await expect(marker).not.toHaveClass(/access-point-selected/);
    expect(await storedAccessPoint(page)).toEqual(moved);
  });

  test("official aires open their details in both modes", async ({ page }) => {
    // Aire de Chanly, on the Lesse (built-in snapshot).
    const network = await serveOffline(page);
    const trip: Trip = {
      name: "",
      points: [
        { lat: 50.083, lng: 5.143 },
        { lat: 50.083, lng: 5.163 },
      ],
      legs: [{ mode: "hike" }],
    };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
    await page.goto("/");
    await expect(points(page)).toHaveCount(2);
    await toggleAccessLayer(page);
    const chanly = mapRegion(page).locator(".official-aire-0");
    const details = page.getByRole("dialog", { name: "Aire de Chanly" });
    const close = details.getByRole("button", { name: strings.accessDetailClose });

    await chanly.click();
    await expect(details).toBeVisible();
    await close.click();
    await expect(details).toHaveCount(0);

    await enterAccessPointEditing(page);
    await chanly.click();
    await expect(details).toBeVisible();
    await close.click();
    await expect(points(page)).toHaveCount(2);
    expect(network.blocked).toEqual([]);
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("a tap on an access point with nothing else under it adds a route point", async ({ page }) => {
    await openWith(page, north);
    const marker = markers(page).first();
    const at = await centreOf(marker);
    await page.touchscreen.tap(at.x, at.y);
    await expect(points(page)).toHaveCount(2);
    await expect(marker).not.toHaveClass(/access-point-selected/);
  });

  test("in access point editing a tap selects your access point", async ({ page }) => {
    await openWith(page, north);
    await enterAccessPointEditing(page);
    const marker = markers(page).first();
    // Entering raises the sheet and redraws the marker: tap it once both have settled.
    await expect(marker).toBeInViewport();
    await settled(async () => [await mapOffset(page), await centreOf(marker)]);
    const at = await centreOf(marker);
    await page.touchscreen.tap(at.x, at.y);
    await expect(marker).toHaveClass(/access-point-selected/);
    await expect(points(page)).toHaveCount(1);
  });
});
