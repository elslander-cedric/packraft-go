// Back to start on the phone (GLOSSARY "Loop", ADR 0017): a floating button bottom right, under
// undo, disabled while it can't apply. The closing leg takes the next leg's mode.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const routed = { brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }) };

const text = strings.planner;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const backButton = (page: Page) => page.getByRole("button", { name: text.backToStartButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const nextMode = (page: Page, mode: string) =>
  page.getByRole("group", { name: text.nextLegModeLabel }).getByRole("button", { name: mode });

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A spot on the map, as an offset from the centre of its upper part (above the sheet's peek). */
async function tapSpot(page: Page, dx: number, dy: number) {
  const box = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2 + dx, box.y + box.height / 3 + dy);
}

test("the button is enabled from two points, closes the loop in the next leg's mode, then is disabled again", async ({
  page,
}) => {
  await serveOffline(page, routed);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();

  await expect(backButton(page)).toBeDisabled();
  await nextMode(page, strings.legModePaddle).click();
  await tapSpot(page, -100, 0);
  await expect(points(page)).toHaveCount(1);
  await expect(backButton(page)).toBeDisabled();
  await tapSpot(page, 80, 0);
  await expect(points(page)).toHaveCount(2);

  // It sits under undo, at the bottom of the right-hand column.
  await expect(backButton(page)).toBeEnabled();
  const back = (await backButton(page).boundingBox())!;
  const undo = (await undoButton(page).boundingBox())!;
  expect(Math.abs(back.x - undo.x)).toBeLessThan(1);
  expect(back.y).toBeGreaterThanOrEqual(undo.y + undo.height);

  // The planner walks back: the closing leg takes the toggle's mode.
  await nextMode(page, strings.legModeHike).click();
  await backButton(page).click();
  await expect(points(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-hike/);
  const start = await centreOf(points(page).first());
  const end = await centreOf(points(page).last());
  expect(Math.abs(end.x - start.x)).toBeLessThan(1);
  expect(Math.abs(end.y - start.y)).toBeLessThan(1);

  // The trip ends on its start: nothing more to close.
  await expect(backButton(page)).toBeDisabled();
});
