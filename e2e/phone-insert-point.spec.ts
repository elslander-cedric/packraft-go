// Inserting a point by holding a leg on the phone (#122, ADR 0026, stories 46–49, 51, 52):
// a 0.4 s touch hold on a leg (timed by the app, not Leaflet's contextmenu, #112) or a
// right-click with a mouse inserts a via point on the leg's route; both halves are routed again.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { touch, type Pixel } from "./support/touch";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const routed = { brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }) };

// The two ends of the recorded hiking route, so the routed leg is drawn from point to point.
const trip: Trip = {
  name: "",
  points: [
    { lat: 50.352699, lng: 5.456097 },
    { lat: 50.343913, lng: 5.470053 },
  ],
  legs: [{ mode: "hike" }],
};

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const legHits = (page: Page) => mapRegion(page).locator("path.leg-hit");
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

/** The trip as autosaved on the device. */
const storedTrip = (page: Page): Promise<Trip> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null").trip, TRIP_KEY);

/** Where the map's pane is shifted to: it changes when the map pans. */
const mapOffset = (page: Page) =>
  mapRegion(page)
    .locator(".leaflet-map-pane")
    .evaluate((element) => {
      const m = new DOMMatrix(getComputedStyle(element).transform);
      return { x: m.m41, y: m.m42 };
    });

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

/** Opens the phone with the trip stored, and waits for its leg to be routed and the map to settle. */
async function openWithRoutedLeg(page: Page) {
  const network = await serveOffline(page, routed);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(points(page)).toHaveCount(2);
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify([await mapOffset(page), await middleOfLeg(page)]);
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [200] },
    )
    .toBe(true);
  expect(network.brouter).toHaveLength(1);
  return network;
}

test("a leg has a transparent hit line about 28 px wide", async ({ page }) => {
  await openWithRoutedLeg(page);
  await expect(legHits(page)).toHaveCount(1);
  await expect(legHits(page).first()).toHaveAttribute("stroke-width", "28");
  await expect(legHits(page).first()).toHaveAttribute("stroke-opacity", "0");
});

test("a 0.4 s hold on a leg inserts a point on its route; both halves are routed again; undo removes it", async ({
  page,
}) => {
  const network = await openWithRoutedLeg(page);
  const offsetBefore = await mapOffset(page);
  const middle = await middleOfLeg(page);
  // A little off the drawn line, still on its hit line.
  await (await touch(page)).hold({ x: middle.x, y: middle.y + 6 }, 550);

  await expect(points(page)).toHaveCount(3);
  await expect.poll(() => network.brouter.length).toBe(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  expect(await mapOffset(page)).toEqual(offsetBefore);
  const after = await storedTrip(page);
  expect(after.points[0]).toEqual(trip.points[0]);
  expect(after.points[2]).toEqual(trip.points[1]);
  expect(after.legs.map((leg) => leg.mode)).toEqual(["hike", "hike"]);
  // The inserted point lies between the two ends.
  expect(after.points[1].lat).toBeLessThan(trip.points[0].lat);
  expect(after.points[1].lat).toBeGreaterThan(trip.points[1].lat);

  await undoButton(page).click();
  await expect(points(page)).toHaveCount(2);
  await expect(legLines(page)).toHaveCount(1);
  expect((await storedTrip(page)).points).toEqual(trip.points);
  expect(network.blocked).toEqual([]);
});

test("a shorter hold on a leg does not insert", async ({ page }) => {
  const network = await openWithRoutedLeg(page);
  const middle = await middleOfLeg(page);
  await (await touch(page)).hold(middle, 150);
  await page.waitForTimeout(500); // past the hold time
  // It is a tap: the route's first leg is left as it was (a tap may add a point at the end).
  const after = await storedTrip(page);
  expect(after.points.slice(0, 2)).toEqual(trip.points);
  expect(after.legs[0].route?.status).toBe("routed");
  expect(network.brouter.length).toBeLessThanOrEqual(2);
});

test("holding the empty map does nothing and the map doesn't pan", async ({ page }) => {
  await openWithRoutedLeg(page);
  const offsetBefore = await mapOffset(page);
  const box = (await mapRegion(page).boundingBox())!;
  await (await touch(page)).hold({ x: box.x + 40, y: box.y + 60 }, 600);
  await page.waitForTimeout(300);
  await expect(points(page)).toHaveCount(2);
  expect((await storedTrip(page)).points).toEqual(trip.points);
  expect(await mapOffset(page)).toEqual(offsetBefore);
});

test.describe("in a narrowed desktop window", () => {
  test.use({ viewport: { width: 600, height: 900 }, hasTouch: false, isMobile: false, userAgent: undefined });

  test("a right-click on a leg inserts a point; undo removes it", async ({ page }) => {
    const network = await openWithRoutedLeg(page);
    const middle = await middleOfLeg(page);
    await page.mouse.click(middle.x, middle.y + 6, { button: "right" });

    await expect(points(page)).toHaveCount(3);
    await expect.poll(() => network.brouter.length).toBe(3);
    await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);

    await undoButton(page).click();
    await expect(points(page)).toHaveCount(2);
  });

  test("a right-click on the empty map does nothing", async ({ page }) => {
    await openWithRoutedLeg(page);
    const box = (await mapRegion(page).boundingBox())!;
    await page.mouse.click(box.x + 40, box.y + 60, { button: "right" });
    await page.waitForTimeout(300);
    await expect(points(page)).toHaveCount(2);
  });
});
