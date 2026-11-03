// Changing a leg's mode by tapping it on the map (#230): a tap on a leg selects it and shows a
// card with its mode; pressing the other mode changes it as one undoable edit and routes the leg
// again with that profile. A tap on the map, on the leg again, Escape or the card's button
// unselect it. Holding a leg still inserts a point (#122). BRouter answers from recorded responses.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { freeMapBox, mapRegion, openPlanner, pointOnPath, points, undoButton } from "./support/planner";
import { touch } from "./support/touch";

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

// The two ends of the recorded hiking route, so the routed leg is drawn from point to point.
const trip: Trip = {
  name: "",
  points: [
    { lat: 50.352699, lng: 5.456097 },
    { lat: 50.343913, lng: 5.470053 },
  ],
  legs: [{ mode: "hike" }],
};

const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const legHits = (page: Page) => mapRegion(page).locator("path.leg-hit");
const selectedCasing = (page: Page) => mapRegion(page).locator("path.leg-casing-selected");
const card = (page: Page) => page.getByRole("group", { name: /^Leg 1 · / });
const modeButton = (page: Page, mode: string) =>
  card(page).getByRole("group", { name: strings.legModeLabel(1) }).getByRole("button", { name: mode });

/** The trip as autosaved on the device. */
const storedTrip = (page: Page): Promise<Trip> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null").trip, TRIP_KEY);

/** Opens the planner with the trip stored and waits for its leg to be routed. */
async function openWithRoutedLeg(page: Page) {
  const network = await serveOffline(page, { brouter: byProfile });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  await openPlanner(page);
  await expect(points(page)).toHaveCount(2);
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);
  expect(network.brouter).toHaveLength(1);
  return network;
}

/** A free spot of the map away from the leg, in viewport pixels. */
async function awayFromLeg(page: Page) {
  const free = await freeMapBox(page);
  return { x: free.x + 60, y: free.y + free.height - 120 };
}

test.describe("with a mouse", () => {
  test("a click on a leg selects it and shows its mode; it adds no point", async ({ page }) => {
    const network = await openWithRoutedLeg(page);
    const at = await pointOnPath(page, legHits(page));
    await page.mouse.click(at.x, at.y);

    await expect(card(page)).toBeVisible();
    await expect(modeButton(page, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
    await expect(selectedCasing(page)).toHaveCount(1);
    await expect(points(page)).toHaveCount(2);
    expect(network.brouter).toHaveLength(1);
    expect(network.blocked).toEqual([]);
  });

  test("pressing Paddle routes the leg on the river and keeps it selected; undo brings it back", async ({ page }) => {
    const network = await openWithRoutedLeg(page);
    const at = await pointOnPath(page, legHits(page));
    await page.mouse.click(at.x, at.y);
    await modeButton(page, strings.legModePaddle).click();

    await expect(legLines(page).first()).toHaveClass(/leg-paddle/);
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);
    expect(network.brouter.at(-1)?.searchParams.get("profile")).toBe("river");
    expect((await storedTrip(page)).legs.map((leg) => leg.mode)).toEqual(["paddle"]);
    await expect(modeButton(page, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
    await expect(selectedCasing(page)).toHaveCount(1);

    await undoButton(page).click();
    await expect(legLines(page).first()).toHaveClass(/leg-hike/);
    expect((await storedTrip(page)).legs.map((leg) => leg.mode)).toEqual(["hike"]);
    // Undo is an edit: the leg is unselected.
    await expect(card(page)).toHaveCount(0);
    expect(network.blocked).toEqual([]);
  });

  test("a click on the map while a leg is selected only unselects it", async ({ page }) => {
    await openWithRoutedLeg(page);
    const at = await pointOnPath(page, legHits(page));
    await page.mouse.click(at.x, at.y);
    await expect(card(page)).toBeVisible();

    const away = await awayFromLeg(page);
    await page.mouse.click(away.x, away.y);
    await expect(card(page)).toHaveCount(0);
    await expect(selectedCasing(page)).toHaveCount(0);
    await expect(points(page)).toHaveCount(2);
  });

  test("the card's button, Escape and a click on the leg again unselect it", async ({ page }) => {
    await openWithRoutedLeg(page);
    const at = await pointOnPath(page, legHits(page));
    // Clicks on the same spot, each past the double tap window, which gives only one tap.
    const clickLeg = async () => {
      await page.waitForTimeout(500);
      await page.mouse.click(at.x, at.y);
    };

    await clickLeg();
    await card(page).getByRole("button", { name: strings.planner.selectedLegClose }).click();
    await expect(card(page)).toHaveCount(0);

    await clickLeg();
    await expect(card(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);

    await clickLeg();
    await expect(card(page)).toBeVisible();
    await clickLeg();
    await expect(card(page)).toHaveCount(0);
    await expect(points(page)).toHaveCount(2);
  });

  test("a click on a point selects the point and unselects the leg", async ({ page }) => {
    await openWithRoutedLeg(page);
    const at = await pointOnPath(page, legHits(page));
    await page.mouse.click(at.x, at.y);
    await expect(card(page)).toBeVisible();

    const box = (await points(page).first().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(points(page).first()).toHaveClass(/point-selected/);
    await expect(card(page)).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("a tap on a leg shows its mode; a hold still inserts a point and shows no card", async ({ page }) => {
    await openWithRoutedLeg(page);
    const at = await pointOnPath(page, legHits(page));
    await page.touchscreen.tap(at.x, at.y);
    await expect(card(page)).toBeVisible();
    await expect(points(page)).toHaveCount(2);
    await card(page).getByRole("button", { name: strings.planner.selectedLegClose }).click();
    await expect(card(page)).toHaveCount(0);

    await (await touch(page)).hold(at, 550);
    await expect(points(page)).toHaveCount(3);
    await expect(page.getByRole("group", { name: /^Leg \d+ · / })).toHaveCount(0);
  });
});
