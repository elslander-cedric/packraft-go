// Paddle legs snap to rivers (#5). BRouter is answered from recorded responses:
// the hiking profile gets the recorded trail, the river profile the recorded
// Lesse track. A leg's mode is picked with the next leg's mode toggle when it is drawn (ADR 0034).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { freeMapBox, mapClicker, nextLegMode, openPlanner } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

async function openMap(page: Page) {
  await openPlanner(page);
  return mapClicker(page);
}

test("a hike → paddle → hike trip: the middle leg follows the river, shows its drop, and put-in and take-out are marked", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  // New legs are hike legs at first.
  await expect(nextLegMode(page, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
  await clickMap(-150, 0);
  await clickMap(-50, 0);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  // No put-in or take-out yet.
  await expect(mapRegion(page).locator("path.put-in, path.take-out")).toHaveCount(0);
  await clickMap(50, 0, "paddle");
  await clickMap(150, 0, "hike");
  await expect(legLines(page)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(legLines(page).nth(i)).toHaveClass(/leg-routed/);

  // The middle leg is routed with the river profile and drawn as a paddle leg.
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-hike/);
  await expect(legLines(page).nth(2)).toHaveClass(/leg-hike/);
  const hikeColour = await legLines(page).nth(0).getAttribute("stroke");
  expect(await legLines(page).nth(1).getAttribute("stroke")).not.toBe(hikeColour);
  await expect(rows(page).nth(1)).toHaveClass(/planner-row-paddle/);

  const profiles = network.brouter.map((url) => url.searchParams.get("profile"));
  expect(profiles).toEqual(["hiking-mountain", "river", "hiking-mountain"]);

  // The paddle leg shows the recorded Lesse track's length and drop, not climb and descent.
  const paddleRow = rows(page).nth(1);
  await expect(paddleRow).toContainText("5.9 km");
  await expect(paddleRow).toContainText(`${strings.dropLabel} 7 m`);
  await expect(paddleRow).not.toContainText(strings.climbLabel);
  await expect(paddleRow).not.toContainText(strings.descentLabel);
  // Hike legs keep climb and descent.
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(2)).toContainText(`${strings.descentLabel} 59 m`);

  // A put-in where the paddle leg starts and a take-out where it ends.
  const putIn = mapRegion(page).locator("path.put-in");
  const takeOut = mapRegion(page).locator("path.take-out");
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);
  // (The one planner marks them with rings, without the desktop's text labels, ADR 0034.)
  // The markers sit on the second and third points: put-in left of take-out.
  const putInBox = (await putIn.boundingBox())!;
  const takeOutBox = (await takeOut.boundingBox())!;
  const mapBox = (await freeMapBox(page));
  const centreX = mapBox.x + mapBox.width / 2;
  expect(Math.abs(putInBox.x + putInBox.width / 2 - (centreX - 50))).toBeLessThan(3);
  expect(Math.abs(takeOutBox.x + takeOutBox.width / 2 - (centreX + 50))).toBeLessThan(3);

  expect(network.blocked).toEqual([]);
});

// Updated for ADR 0034: a drawn leg's mode can't be switched; undo takes a paddle leg away.
test("undoing a paddle leg brings back the hike trip before it without asking BRouter again", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(0, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await clickMap(100, 0, "paddle");
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);

  await page.getByRole("button", { name: strings.undoButton }).click();

  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveClass(/leg-hike/);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  expect(network.brouter.map((url) => url.searchParams.get("profile"))).toEqual(["hiking-mountain", "river"]);
});

test("undoing the only paddle leg removes its put-in and take-out", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0, "paddle");
  // A trip that ends on the water has a take-out at its end.
  await expect(mapRegion(page).locator("path.put-in")).toHaveCount(1);
  await expect(mapRegion(page).locator("path.take-out")).toHaveCount(1);

  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect(mapRegion(page).locator("path.put-in, path.take-out")).toHaveCount(0);
});

test("a trip that starts on the water has a put-in at its start", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0, "paddle");

  const putIn = mapRegion(page).locator("path.put-in");
  const takeOut = mapRegion(page).locator("path.take-out");
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);
  const mapBox = (await freeMapBox(page));
  const centreX = mapBox.x + mapBox.width / 2;
  const middle = async (marker: typeof putIn) => {
    const box = (await marker.boundingBox())!;
    return box.x + box.width / 2;
  };
  expect(Math.abs((await middle(putIn)) - (centreX - 100))).toBeLessThan(3);
  expect(Math.abs((await middle(takeOut)) - (centreX + 100))).toBeLessThan(3);
});

test("a paddle leg that ends more than 2 m higher shows a rise with an upstream hint instead of a drop", async ({
  page,
}) => {
  // The recorded Lesse track, reversed: it now climbs 7.25 m, as if drawn upstream.
  const upstream = JSON.parse(RIVER.body);
  upstream.features[0].geometry.coordinates.reverse();
  const UPSTREAM: BRouterReply = { status: 200, body: JSON.stringify(upstream) };
  await serveOffline(page, { brouter: (url) => (url.searchParams.get("profile") === "river" ? UPSTREAM : TRAIL) });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0, "paddle");

  const row = rows(page).nth(0);
  await expect(row).toContainText(`${strings.planner.legFigures.rise} 7 m?`);
  await expect(row).not.toContainText(strings.dropLabel);
});

for (const { rise, shown } of [
  { rise: 2.4, shown: `${strings.dropLabel} 0 m` },
  { rise: 2.6, shown: `${strings.planner.legFigures.rise} 3 m?` },
]) {
  test(`a paddle leg ending ${rise} m higher shows "${shown}" (rise rounded before the 2 m rule)`, async ({ page }) => {
    const track = JSON.parse(RIVER.body);
    const coordinates = track.features[0].geometry.coordinates;
    coordinates[coordinates.length - 1][2] = coordinates[0][2] + rise;
    const RISING: BRouterReply = { status: 200, body: JSON.stringify(track) };
    await serveOffline(page, { brouter: (url) => (url.searchParams.get("profile") === "river" ? RISING : TRAIL) });
    const clickMap = await openMap(page);

    await clickMap(-100, 0);
    await clickMap(100, 0, "paddle");

    await expect(rows(page).nth(0)).toContainText(shown);
  });
}

test("a paddle leg with no river between its points says no river route was found", async ({ page }) => {
  const NO_ROUTE: BRouterReply = { status: 400, body: brouterFixture("hiking-no-route-400.txt") };
  await serveOffline(page, { brouter: () => NO_ROUTE });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0);
  // A hike leg keeps the general message.
  await expect(rows(page).nth(0)).toContainText(strings.legRouteFailed["no-route"]);

  // The same leg drawn as a paddle leg.
  await page.keyboard.press("ControlOrMeta+z");
  await clickMap(100, 0, "paddle");
  await expect(rows(page).nth(0)).toContainText(strings.legRouteFailedNoRiver);
  await expect(rows(page).nth(0)).not.toContainText(strings.legRouteFailed["no-route"]);
});

test("a point added after a paddle leg makes a paddle leg, routed with the river profile (#116)", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(0, 0, "paddle");
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);

  // The next leg's mode follows the last leg: paddle.
  await expect(nextLegMode(page, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toHaveClass(/planner-row-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);

  const profiles = network.brouter.map((url) => url.searchParams.get("profile"));
  expect(profiles[profiles.length - 1]).toBe("river");
});
