// Access point editing freezes the trip (ADR 0036, #227): the trip stays drawn, but its points
// have no hit areas, holding a leg inserts nothing, undo, delete and camp are off (buttons and
// keys), snap offers wait until leaving, and a tap on the empty map only places a new access point
// (not stored until its details are saved), never a route point. Your access points
// drag without panning the map, even on a route point (by touch and by mouse); official aires
// still open their details.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint, type AccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { enterAccessPointEditing, leaveAccessPointEditing } from "./support/accessPointEditing";
import { toggleAccessLayer } from "./support/mapMenu";
import { brouterFixture, serveOffline } from "./support/offline";
import {
  inputHandled,
  legLines,
  mapClicker,
  mapOffset,
  mapRegion,
  openPlanner,
  points,
  settled,
  undoButton,
} from "./support/planner";
import { touch, type Pixel } from "./support/touch";

const text = strings.planner;
const hiking = {
  brouter: () => ({
    status: 200,
    body: brouterFixture("hiking-success.geojson"),
  }),
};
const river = {
  brouter: () => ({
    status: 200,
    body: brouterFixture("river-success.geojson"),
  }),
};

const hitAreas = (page: Page) => mapRegion(page).locator("path.point-hit");
const legHits = (page: Page) => mapRegion(page).locator("path.leg-hit");
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const deleteButton = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
const snapOffer = (page: Page) => page.getByRole("region", { name: strings.snap.label });

const storedTrip = (page: Page): Promise<Trip> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null").trip, TRIP_KEY);
const storedAccessPoints = (page: Page): Promise<AccessPoint[]> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.accessPoints ?? [], ACCESS_POINTS_KEY);

async function centreOf(shape: Locator): Promise<Pixel> {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The point half way along the first drawn leg, in viewport pixels. */
const middleOfLeg = (page: Page): Promise<Pixel> =>
  legLines(page)
    .first()
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const half = path.getPointAtLength(path.getTotalLength() / 2);
      const { x, y } = new DOMPoint(half.x, half.y).matrixTransform(path.getScreenCTM()!);
      return { x, y };
    });

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  // The two ends of the recorded hiking route, so the routed leg is drawn from point to point.
  const trip: Trip = {
    name: "",
    points: [
      { lat: 50.352699, lng: 5.456097 },
      { lat: 50.343913, lng: 5.470053 },
    ],
    legs: [{ mode: "hike" }],
  };
  const T = "2026-05-01T08:00:00.000Z";
  // A slipway exactly on the first route point.
  const onFirstPoint = updateAccessPoint(
    addAccessPoint([], { id: "ap-1", at: trip.points[0], now: T }),
    "ap-1",
    { kind: "slipway", use: "put-in" },
    T,
  );

  /** Opens the phone with the trip (and `accessPoints`) stored, enters access point editing and puts the sheet back to its peek. */
  async function openEditing(page: Page, accessPoints: readonly AccessPoint[] = []) {
    const network = await serveOffline(page, hiking);
    await page.addInitScript(
      ([tripKey, tripValue, key, value]) => {
        localStorage.setItem(tripKey, tripValue);
        localStorage.setItem(key, value);
      },
      [TRIP_KEY, serialiseTrip(trip), ACCESS_POINTS_KEY, serialiseAccessPoints(accessPoints)],
    );
    await page.goto("/");
    await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
    await expect(points(page)).toHaveCount(2);
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);
    await expect(hitAreas(page)).toHaveCount(2);
    await expect(legHits(page)).toHaveCount(1);
    await enterAccessPointEditing(page);
    // Entering raises the sheet; back to the peek, so the whole trip is in sight.
    await page.getByRole("slider", { name: text.resizeSheetHandle }).focus();
    await page.keyboard.press("Home");
    await expect(page.locator(".planner")).toHaveClass(/planner-stop-peek/);
    await settled(async () => [await mapOffset(page), await centreOf(points(page).nth(1))]);
    return network;
  }

  test("an access point on a route point drags, is saved, and the route point and the map stay", async ({ page }) => {
    await openEditing(page, onFirstPoint);
    // No hit areas: the trip is frozen.
    await expect(hitAreas(page)).toHaveCount(0);
    await expect(legHits(page)).toHaveCount(0);

    const at = await centreOf(points(page).nth(0));
    const marker = await centreOf(markers(page).first());
    expect(Math.abs(marker.x - at.x)).toBeLessThan(3);
    expect(Math.abs(marker.y - at.y)).toBeLessThan(3);

    const offsetBefore = await mapOffset(page);
    const to = { x: at.x + 60, y: at.y - 50 };
    await (await touch(page)).drag(at, to);

    await expect.poll(async () => (await centreOf(markers(page).first())).x).toBeGreaterThan(at.x + 50);
    expect(await mapOffset(page)).toEqual(offsetBefore);
    const point = await centreOf(points(page).nth(0));
    expect(Math.abs(point.x - at.x)).toBeLessThan(3);
    expect(Math.abs(point.y - at.y)).toBeLessThan(3);
    expect((await storedTrip(page)).points[0]).toEqual(trip.points[0]);
    await expect.poll(async () => (await storedAccessPoints(page))[0].position.lng).toBeGreaterThan(trip.points[0].lng);
  });

  test("a press on a route point does nothing to it and holding a leg inserts no point; after leaving it does", async ({
    page,
  }) => {
    const network = await openEditing(page);
    const fingers = await touch(page);

    await fingers.hold(await middleOfLeg(page), 600);
    await inputHandled(page);
    await expect(points(page)).toHaveCount(2);

    const second = await centreOf(points(page).nth(1));
    await page.touchscreen.tap(second.x, second.y);
    await expect(points(page).nth(1)).not.toHaveClass(/point-selected/);
    await expect(deleteButton(page)).toHaveCount(0);
    await expect(campButton(page)).toHaveCount(0);

    // A drag from a route point pans the map at most: the point stays where it was.
    const from = await centreOf(points(page).nth(1));
    await fingers.drag(from, { x: from.x - 40, y: from.y - 80 });
    await settled(() => mapOffset(page));
    expect((await storedTrip(page)).points).toEqual(trip.points);
    expect(network.brouter).toHaveLength(1);

    await leaveAccessPointEditing(page);
    await expect(hitAreas(page)).toHaveCount(2);
    await settled(() => middleOfLeg(page));
    await fingers.hold(await middleOfLeg(page), 600);
    await expect(points(page)).toHaveCount(3);
  });

  test("with a fix, a tap on the empty map places a new access point there, not a route point, and stores nothing", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 50.268,
      longitude: 5.446,
      accuracy: 10,
    });
    await serveOffline(page);
    await openPlanner(page);
    await page.getByRole("button", { name: text.showPositionButton }).click();
    await expect(mapRegion(page).locator(".my-position")).toHaveCount(1);
    await enterAccessPointEditing(page);
    const box = (await mapRegion(page).boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2 - 60, box.y + box.height / 4);
    await inputHandled(page);
    await expect(points(page)).toHaveCount(0);
    await expect(markers(page)).toHaveCount(1);
    await expect(markers(page)).toHaveClass(/access-point-draft/);
    await expect(page.getByRole("dialog", { name: text.accessPointDialogTitle })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), ACCESS_POINTS_KEY)).not.toContain("position");
  });
});

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("a mouse drag moves an access point on a route point, is saved, and the route point and the map stay", async ({
    page,
  }) => {
    const trip: Trip = {
      name: "",
      points: [
        { lat: 50.352699, lng: 5.456097 },
        { lat: 50.343913, lng: 5.470053 },
      ],
      legs: [{ mode: "hike" }],
    };
    const T = "2026-05-01T08:00:00.000Z";
    const onFirstPoint = updateAccessPoint(
      addAccessPoint([], { id: "ap-1", at: trip.points[0], now: T }),
      "ap-1",
      { kind: "slipway", use: "put-in" },
      T,
    );
    await serveOffline(page, hiking);
    await page.addInitScript(
      ([tripKey, tripValue, key, value]) => {
        localStorage.setItem(tripKey, tripValue);
        localStorage.setItem(key, value);
      },
      [TRIP_KEY, serialiseTrip(trip), ACCESS_POINTS_KEY, serialiseAccessPoints(onFirstPoint)],
    );
    await openPlanner(page);
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);
    await enterAccessPointEditing(page);
    await expect(hitAreas(page)).toHaveCount(0);
    await settled(async () => [await mapOffset(page), await centreOf(markers(page).first())]);

    const at = await centreOf(points(page).nth(0));
    const marker = await centreOf(markers(page).first());
    expect(Math.abs(marker.x - at.x)).toBeLessThan(3);
    expect(Math.abs(marker.y - at.y)).toBeLessThan(3);

    const offsetBefore = await mapOffset(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 60, at.y - 50, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await centreOf(markers(page).first())).x).toBeGreaterThan(at.x + 50);
    expect(await mapOffset(page)).toEqual(offsetBefore);
    const point = await centreOf(points(page).nth(0));
    expect(Math.abs(point.x - at.x)).toBeLessThan(3);
    expect(Math.abs(point.y - at.y)).toBeLessThan(3);
    expect((await storedTrip(page)).points[0]).toEqual(trip.points[0]);
    await expect.poll(async () => (await storedAccessPoints(page))[0].position.lng).toBeGreaterThan(trip.points[0].lng);
  });

  test("undo, delete and camp are off, by button and by key; leaving brings them back", async ({ page }) => {
    await serveOffline(page, hiking);
    await openPlanner(page);
    const click = await mapClicker(page);
    await click(-100, 0);
    await click(100, 40);
    await expect(points(page)).toHaveCount(2);
    await expect(undoButton(page)).toBeEnabled();

    await enterAccessPointEditing(page);
    await expect(undoButton(page)).toHaveCount(0);
    await expect(deleteButton(page)).toHaveCount(0);
    await expect(campButton(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: text.backToStartButton })).toHaveCount(0);
    await page.locator("body").focus();
    for (const key of ["Control+z", "Meta+z", "Delete", "Backspace"]) await page.keyboard.press(key);
    await inputHandled(page);
    await expect(points(page)).toHaveCount(2);

    await leaveAccessPointEditing(page);
    await expect(undoButton(page)).toBeEnabled();
    await page.keyboard.press("Control+z");
    await expect(points(page)).toHaveCount(1);
  });

  test("snap offers are hidden while editing access points and come back on leaving", async ({ page }) => {
    const start = { lat: 50.3427, lng: 5.4563 };
    const putIn = { lat: 50.3527, lng: 5.4563 };
    const nearby = { lat: 50.3537, lng: 5.4563 }; // about 111 m from the put-in
    const T = "2026-10-14T08:00:00.000Z";
    const slipway = updateAccessPoint(
      addAccessPoint([], { id: "ap1", at: nearby, now: T }),
      "ap1",
      { kind: "slipway", use: "put-in" },
      T,
    );
    const seeded: Trip = {
      name: "Ourthe",
      points: [start, putIn],
      legs: [
        {
          mode: "hike",
          route: {
            status: "routed",
            geometry: [start, putIn].map((p) => ({ ...p, elevation: 5 })),
          },
        },
      ],
    };
    await serveOffline(page, river);
    await page.addInitScript(
      ([tripKey, tripValue, key, value]) => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem(tripKey, tripValue);
        localStorage.setItem(key, value);
      },
      [TRIP_KEY, serialiseTrip(seeded), ACCESS_POINTS_KEY, serialiseAccessPoints(slipway)],
    );
    await openPlanner(page);
    // Beside the hike leg, which runs up the middle of the map: a click on a leg selects it (#230).
    await (await mapClicker(page))(100, -150, "paddle");
    await expect(legLines(page)).toHaveCount(2);
    await expect(snapOffer(page)).toBeVisible();

    await enterAccessPointEditing(page);
    await expect(snapOffer(page)).toHaveCount(0);
    await leaveAccessPointEditing(page);
    await expect(snapOffer(page)).toBeVisible();
  });

  test("an official aire opens its details while editing access points", async ({ page }) => {
    const nearChanly: Trip = {
      name: "",
      points: [
        { lat: 50.083, lng: 5.143 },
        { lat: 50.083, lng: 5.163 },
      ],
      legs: [{ mode: "hike" }],
    };
    const network = await serveOffline(page);
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(nearChanly)]);
    await page.goto("/");
    await expect(points(page)).toHaveCount(2);
    await toggleAccessLayer(page);
    await enterAccessPointEditing(page);

    await mapRegion(page).locator(".official-aire-0").click();
    const dialog = page.getByRole("dialog", { name: "Aire de Chanly" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: strings.accessDetailClose }).click();
    await expect(dialog).toHaveCount(0);
    await expect(points(page)).toHaveCount(2);
    expect(network.blocked).toEqual([]);
  });
});
