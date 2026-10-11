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
  // A trip that ends on the water has a put-in but no take-out.
  await expect(mapRegion(page).locator("path.put-in")).toHaveCount(1);
  await expect(mapRegion(page).locator("path.take-out")).toHaveCount(0);

  await modeButton(page, 1, strings.legModeHike).click();
  await expect(mapRegion(page).locator("path.put-in, path.take-out")).toHaveCount(0);
});
