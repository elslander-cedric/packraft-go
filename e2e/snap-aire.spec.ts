// #62, #207: snapping a new put-in to one of your access points or an official aire
// (accept, undo and decline), and the Walloon aire warning on the leg, the day and the
// trip summary.
import { expect, test, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import type { LatLng, Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import {
  freeMapCentre,
  legDetailsDialog,
  legLines,
  openPlanner,
  openSectionDetails,
  pickNextMode,
  points,
  saveTripFile,
  showTab,
} from "./support/planner";

test.use({ viewport: { width: 1400, height: 900 } });

// Durbuy is in Wallonia. 0.001 degrees of latitude is about 111 m.
const putIn = { lat: 50.3527, lng: 5.4563 };
const nearby = { lat: 50.3537, lng: 5.4563 };


async function seed(page: Page, kind: "slipway" | "official-aire") {
  const trip = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    // Only the start: the planner draws the paddle leg from it, which makes it a new put-in.
    trip: { name: "Ourthe", points: [putIn], legs: [] },
  });
  const now = "2026-10-14T08:00:00.000Z";
  const added = addAccessPoint([], { id: "ap1", at: nearby, now });
  const points = serialiseAccessPoints(updateAccessPoint(added, "ap1", { kind, use: "put-in" }, now));
  await page.addInitScript(
    ([tripSave, pointsSave]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("packraft-go.trip", tripSave);
      localStorage.setItem("packraft-go.access-points", pointsSave);
    },
    [trip, points],
  );
}

/**
 * Draws a paddle leg from the trip's start with the next leg's mode toggle (ADR 0034): the start
 * becomes a new put-in, about 111 m from your access point.
 */
async function drawPaddleLeg(page: Page) {
  await openPlanner(page);
  await pickNextMode(page, "paddle");
  const centre = await freeMapCentre(page);
  // The map opens fitted to the one point, as close as it goes: zoom out a few levels, so the
  // take-out is far enough (several hundred metres) from the aire.
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 180);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await page.waitForTimeout(300);
  await page.mouse.click(centre.x + 300, centre.y - 250);
  await expect(legLines(page)).toHaveCount(1);
}
const legDetails = legDetailsDialog;
const offer = (page: Page) => page.getByRole("region", { name: strings.snap.label });
const storedFirstPoint = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null")?.trip?.points?.[0]);

test("a new put-in near your access point offers a snap; accepting moves it and undo brings it back", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await drawPaddleLeg(page);
  await expect(offer(page)).toBeVisible();
  await expect(offer(page)).toContainText("put-in");
  await offer(page).getByRole("button", { name: strings.snap.accept }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedFirstPoint(page)).toEqual(nearby);

  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect.poll(() => storedFirstPoint(page)).toEqual(putIn);
});

test("declining the snap offer changes nothing", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await drawPaddleLeg(page);
  await offer(page).getByRole("button", { name: strings.snap.decline }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedFirstPoint(page)).toEqual(putIn);
});

test("a Walloon put-in without an official aire nearby shows the warning on the leg and a chip on its day", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await drawPaddleLeg(page);

  // The leg's details dialog (#158) holds the warning.
  await openSectionDetails(page, 1);
  await expect(legDetails(page).locator(".access-warning-aire").first()).toContainText(strings.aire.warningKind);
  await legDetails(page).getByRole("button", { name: strings.planner.legDetailsClose }).click();
  // The day only points at the leg (ADR 0029); the paddle leg is also forbidden here or not, but it has a chip.
  await showTab(page, strings.planner.tabs.days);
  const days = page.getByRole("complementary", { name: strings.daysPanelLabel });
  await expect(days.locator(".day-warning-chip")).toHaveCount(1);
  await expect(days.locator(".access-warning-aire")).toHaveCount(0);

  // It never blocks: the trip can still be saved.
  const save = await saveTripFile(page);
  expect(save.suggestedFilename()).toMatch(/\.packraft\.json$/);
});

test("an official aire of yours within 200 m of the put-in removes that warning", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "official-aire");
  await drawPaddleLeg(page);

  await openSectionDetails(page, 1);
  // The take-out at the leg's end is still not at an aire; the put-in is.
  await expect(legDetails(page).locator(".access-warning-aire")).toHaveCount(1);
  await expect(legDetails(page).locator(".access-warning-aire")).toContainText("take-out");
});

// Built-in official aires, in the data as of the 2026-11-02 snapshot.
const MOYEN = { lat: 49.69942, lng: 5.37755, name: "Aire de Moyen (plaine de jeux)", use: "both" as const };
const CHANLY_TAKE_OUT_ONLY = { lat: 50.07847, lng: 5.15324 };
const ACCESS_POINTS_KEY = "packraft-go.access-points";

const north = (at: LatLng, degrees: number): LatLng => ({ lat: at.lat + degrees, lng: at.lng });

/** Starts the planner on a stored trip, once per test. */
async function storeTripOnce(page: Page, trip: Trip) {
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(key, value);
    },
    [TRIP_KEY, serialiseTrip(trip)],
  );
}

const justTheStart = (at: LatLng): Trip => ({ name: "", points: [at], legs: [] });
const aireWarnings = (page: Page) => legDetails(page).locator(".access-warning-aire");
const closeLegDetails = (page: Page) =>
  legDetails(page).getByRole("button", { name: strings.planner.legDetailsClose }).click();

test.describe("official aires (#207)", () => {
  test("a new put-in near an official aire is offered it by name; accepting moves the trip point only", async ({ page }) => {
    const network = await serveOffline(page);
    const start = north(MOYEN, 0.001); // about 111 m from the aire
    await storeTripOnce(page, justTheStart(start));
    await openPlanner(page);
    await page.waitForLoadState("networkidle"); // The built-in aires load once the trip has a point.
    const pointsBefore = await page.evaluate((key) => localStorage.getItem(key), ACCESS_POINTS_KEY);
    await drawPaddleLeg(page);

    await expect(offer(page)).toContainText(MOYEN.name);
    await expect(offer(page)).toContainText(strings.accessPoints.uses[MOYEN.use].toLowerCase());
    await offer(page).getByRole("button", { name: strings.snap.acceptAire }).click();
    await expect(offer(page)).toHaveCount(0);
    await expect.poll(() => storedFirstPoint(page)).toEqual({ lat: MOYEN.lat, lng: MOYEN.lng });

    // Your access points are as they were.
    expect(await page.evaluate((key) => localStorage.getItem(key), ACCESS_POINTS_KEY)).toEqual(pointsBefore);

    // One undoable edit.
    await page.getByRole("button", { name: strings.undoButton }).click();
    await expect.poll(() => storedFirstPoint(page)).toEqual(start);
    expect(network.blocked).toEqual([]);
  });

  test("moving a put-in near an official aire clears its warning", async ({ page }) => {
    await serveOffline(page);
    const take = north(MOYEN, 0.0236); // Far from any aire.
    await storeTripOnce(page, { name: "", points: [north(MOYEN, 0.0036), take], legs: [{ mode: "paddle" }] });
    await openPlanner(page);
    await expect(points(page)).toHaveCount(2);

    await openSectionDetails(page, 1);
    await expect(aireWarnings(page)).toHaveCount(2);
    await closeLegDetails(page);

    // Both points are on one meridian, so their distance on screen gives the map's scale.
    const [putIn, takeOut] = await Promise.all([points(page).nth(0).boundingBox(), points(page).nth(1).boundingBox()]);
    const pixelsPerDegree = (putIn!.y - takeOut!.y) / (take.lat - north(MOYEN, 0.0036).lat);
    const x = putIn!.x + putIn!.width / 2;
    const y = putIn!.y + putIn!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 0.0031 * pixelsPerDegree, { steps: 6 }); // To about 55 m from the aire.
    await page.mouse.up();

    await openSectionDetails(page, 1);
    await expect(aireWarnings(page)).toHaveCount(1);
    await expect(aireWarnings(page)).toContainText("take-out");
  });

  test("a put-in at a take-out-only official aire still warns", async ({ page }) => {
    await serveOffline(page);
    await storeTripOnce(page, {
      name: "",
      points: [north(CHANLY_TAKE_OUT_ONLY, 0.001), north(CHANLY_TAKE_OUT_ONLY, 0.02)],
      legs: [{ mode: "paddle" }],
    });
    await openPlanner(page);
    await openSectionDetails(page, 1);
    await expect(aireWarnings(page).first()).toContainText("put-in");
    await expect(aireWarnings(page)).toHaveCount(2);
  });
});
