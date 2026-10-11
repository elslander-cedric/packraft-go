// Paddle legs snap to rivers (#5). BRouter is answered from recorded responses:
// the hiking profile gets the recorded trail, the river profile the recorded
// Lesse track.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const modeButton = (page: Page, leg: number, mode: string) =>
  rows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name: mode });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

test("a hike → paddle → hike trip: the middle leg follows the river, shows its drop, and put-in and take-out are marked", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-150, 0);
  await clickMap(-50, 0);
  await clickMap(50, 0);
  await clickMap(150, 0);
  await expect(legLines(page)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(legLines(page).nth(i)).toHaveClass(/leg-routed/);

  // New legs are hike legs; no put-in or take-out yet.
  await expect(modeButton(page, 1, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
  await expect(mapRegion(page).locator("path.put-in, path.take-out")).toHaveCount(0);

  await modeButton(page, 1, strings.legModePaddle).click();

  // The middle leg is re-routed with the river profile and drawn as a paddle leg.
  await expect(modeButton(page, 1, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-hike/);
  await expect(legLines(page).nth(2)).toHaveClass(/leg-hike/);
  const hikeColour = await legLines(page).nth(0).getAttribute("stroke");
  expect(await legLines(page).nth(1).getAttribute("stroke")).not.toBe(hikeColour);
  await expect(rows(page).nth(1)).toHaveClass(/leg-row-paddle/);

  const profiles = network.brouter.map((url) => url.searchParams.get("profile"));
  expect(profiles).toEqual(["hiking-mountain", "hiking-mountain", "hiking-mountain", "river"]);

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
  await expect(mapRegion(page).locator(".leaflet-tooltip", { hasText: strings.putIn })).toHaveCount(1);
  await expect(mapRegion(page).locator(".leaflet-tooltip", { hasText: strings.takeOut })).toHaveCount(1);
  // The markers sit on the second and third points: put-in left of take-out.
  const putInBox = (await putIn.boundingBox())!;
  const takeOutBox = (await takeOut.boundingBox())!;
  const mapBox = (await mapRegion(page).boundingBox())!;
  const centreX = mapBox.x + mapBox.width / 2;
  expect(Math.abs(putInBox.x + putInBox.width / 2 - (centreX - 50))).toBeLessThan(3);
  expect(Math.abs(takeOutBox.x + takeOutBox.width / 2 - (centreX + 50))).toBeLessThan(3);

  expect(network.blocked).toEqual([]);
});

test("undoing a mode switch brings the hike leg back without asking BRouter again", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  await modeButton(page, 0, strings.legModePaddle).click();
  await expect(rows(page).nth(0)).toContainText(`${strings.dropLabel} 7 m`);

  await page.getByRole("button", { name: strings.undoButton }).click();

  await expect(modeButton(page, 0, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
  await expect(legLines(page)).toHaveClass(/leg-hike/);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  expect(network.brouter.map((url) => url.searchParams.get("profile"))).toEqual(["hiking-mountain", "river"]);
});

test("switching a paddle leg back to hike removes its put-in and take-out", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await modeButton(page, 1, strings.legModePaddle).click();
  // A trip that ends on the water has a take-out at its end.
  await expect(mapRegion(page).locator("path.put-in")).toHaveCount(1);
  await expect(mapRegion(page).locator("path.take-out")).toHaveCount(1);

  await modeButton(page, 1, strings.legModeHike).click();
  await expect(mapRegion(page).locator("path.put-in, path.take-out")).toHaveCount(0);
});

test("a trip that starts on the water has a put-in at its start", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0);
  await modeButton(page, 0, strings.legModePaddle).click();

  const putIn = mapRegion(page).locator("path.put-in");
  const takeOut = mapRegion(page).locator("path.take-out");
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);
  const mapBox = (await mapRegion(page).boundingBox())!;
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
  await clickMap(100, 0);
  await modeButton(page, 0, strings.legModePaddle).click();

  const row = rows(page).nth(0);
  await expect(row).toContainText(strings.riseFigure("7 m"));
  await expect(row).not.toContainText(strings.dropLabel);
});

for (const { rise, shown } of [
  { rise: 2.4, shown: `${strings.dropLabel} 0 m` },
  { rise: 2.6, shown: strings.riseFigure("3 m") },
]) {
  test(`a paddle leg ending ${rise} m higher shows "${shown}" (rise rounded before the 2 m rule)`, async ({ page }) => {
    const track = JSON.parse(RIVER.body);
    const coordinates = track.features[0].geometry.coordinates;
    coordinates[coordinates.length - 1][2] = coordinates[0][2] + rise;
    const RISING: BRouterReply = { status: 200, body: JSON.stringify(track) };
    await serveOffline(page, { brouter: (url) => (url.searchParams.get("profile") === "river" ? RISING : TRAIL) });
    const clickMap = await openMap(page);

    await clickMap(-100, 0);
    await clickMap(100, 0);
    await modeButton(page, 0, strings.legModePaddle).click();

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

  await modeButton(page, 0, strings.legModePaddle).click();
  await expect(rows(page).nth(0)).toContainText(strings.legRouteFailedNoRiver);
  await expect(rows(page).nth(0)).not.toContainText(strings.legRouteFailed["no-route"]);
});
