import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { freeMapBox, openPlanner, totals } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const deleteButton = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });

type Pixel = { x: number; y: number };

/** Centre of an SVG shape on the page. */
async function centreOf(shape: Locator): Promise<Pixel> {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const expectNear = (actual: Pixel, expected: Pixel, tolerance = 3) => {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tolerance);
};

async function openMap(page: Page) {
  const network = await serveOffline(page);
  await openPlanner(page);
  const box = (await freeMapBox(page));
  return { network, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** How far Leaflet has panned the map, in pixels, once any inertia has died down. */
async function settledMapOffset(page: Page): Promise<Pixel> {
  const pane = mapRegion(page).locator(".leaflet-map-pane");
  const read = () =>
    pane.evaluate((element) => {
      const m = new DOMMatrix(getComputedStyle(element).transform);
      return { x: m.m41, y: m.m42 };
    });
  let offset = await read();
  await expect
    .poll(async () => {
      const earlier = offset;
      await page.waitForTimeout(150);
      offset = await read();
      return offset.x === earlier.x && offset.y === earlier.y;
    })
    .toBe(true);
  return offset;
}

async function drag(page: Page, from: Pixel, to: Pixel) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test("draw, drag a point, delete a point, then undo everything back to an empty trip", async ({
  page,
}) => {
  const { network, cx, cy } = await openMap(page);
  const a = { x: cx - 200, y: cy };
  const b = { x: cx, y: cy - 100 };
  const c = { x: cx + 200, y: cy };
  const moved = { x: cx, y: cy + 120 };

  // Draw three points: two legs.
  await expect(undoButton(page)).toBeDisabled();
  for (const p of [a, b, c]) await page.mouse.click(p.x, p.y);
  await expect(points(page)).toHaveCount(3);
  await expect(legRows(page)).toHaveCount(2);
  const totalBefore = await totals(page).textContent();

  // Drag the middle point: it moves, both legs follow, no point is added.
  await drag(page, b, moved);
  await expect(points(page)).toHaveCount(3);
  await expect(legRows(page)).toHaveCount(2);
  expectNear(await centreOf(points(page).nth(1)), moved);
  // The other points stay put (the map did not pan).
  expectNear(await centreOf(points(page).nth(0)), a);
  expectNear(await centreOf(points(page).nth(2)), c);
  const firstLeg = (await legLines(page).nth(0).boundingBox())!;
  expect(Math.abs(firstLeg.y + firstLeg.height - moved.y)).toBeLessThan(6);
  await expect(totals(page)).not.toHaveText(totalBefore!);

  // Clicking an existing point selects it instead of adding a point. (The delete button
  // is only shown while a point is selected.)
  await expect(deleteButton(page)).toHaveCount(0);
  await page.mouse.click(moved.x, moved.y);
  await expect(points(page)).toHaveCount(3);
  await expect(mapRegion(page).locator("path.point.point-selected")).toHaveCount(1);

  // Delete it: the two legs merge into one, from a straight to c.
  await deleteButton(page).click();
  await expect(points(page)).toHaveCount(2);
  await expect(legRows(page)).toHaveCount(1);
  await expect(legRows(page).nth(0)).toContainText(strings.planner.legFigures.hike);
  const merged = (await legLines(page).nth(0).boundingBox())!;
  expect(Math.abs(merged.x - a.x)).toBeLessThan(6);
  expect(Math.abs(merged.x + merged.width - c.x)).toBeLessThan(6);

  // Undo the delete: the point comes back where it was dragged to.
  await undoButton(page).click();
  await expect(points(page)).toHaveCount(3);
  expectNear(await centreOf(points(page).nth(1)), moved);

  // Undo the drag: the point is back where it was drawn.
  await undoButton(page).click();
  expectNear(await centreOf(points(page).nth(1)), b);
  await expect(totals(page)).toHaveText(totalBefore!);

  // Undo the three adds, the last one with the keyboard shortcut.
  await undoButton(page).click();
  await undoButton(page).click();
  await expect(points(page)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(points(page)).toHaveCount(0);
  await expect(legRows(page)).toHaveCount(0);
  await expect(undoButton(page)).toBeDisabled();

  expect(network.blocked).toEqual([]);
});

test("the Delete key removes the selected point; deleting an end point removes its leg", async ({
  page,
}) => {
  const { cx, cy } = await openMap(page);
  const a = { x: cx - 150, y: cy };
  const b = { x: cx, y: cy };
  const c = { x: cx + 150, y: cy };
  for (const p of [a, b, c]) await page.mouse.click(p.x, p.y);
  await expect(legRows(page)).toHaveCount(2);

  await page.mouse.click(c.x, c.y);
  await page.keyboard.press("Delete");
  await expect(points(page)).toHaveCount(2);
  await expect(legRows(page)).toHaveCount(1);
  expectNear(await centreOf(points(page).nth(1)), b);

  // The point that was under the mouse is gone: dragging there pans the map again.
  const before = await settledMapOffset(page);
  await drag(page, c, { x: c.x, y: c.y + 50 });
  const after = await settledMapOffset(page);
  const pan = { x: after.x - before.x, y: after.y - before.y };
  // The map follows the drag. Leaflet's inertia may carry it a few pixels further
  // down, depending on how fast the drag ended (slower under load), so allow that.
  expect(Math.abs(pan.x)).toBeLessThan(3);
  expect(pan.y).toBeGreaterThan(47);
  expect(pan.y).toBeLessThan(65);
  // The points stay exactly where they are on the map, however far it moved.
  expectNear(await centreOf(points(page).nth(0)), { x: a.x + pan.x, y: a.y + pan.y });
  expectNear(await centreOf(points(page).nth(1)), { x: b.x + pan.x, y: b.y + pan.y });
  await expect(points(page)).toHaveCount(2);
});

test("a selected point can still be dragged, and dragging does not select or add points", async ({
  page,
}) => {
  const { cx, cy } = await openMap(page);
  const a = { x: cx - 150, y: cy };
  const b = { x: cx + 150, y: cy };
  const moved = { x: cx + 150, y: cy + 100 };
  for (const p of [a, b]) await page.mouse.click(p.x, p.y);

  await page.mouse.click(b.x, b.y);
  await expect(mapRegion(page).locator("path.point.point-selected")).toHaveCount(1);
  await drag(page, b, moved);
  await expect(points(page)).toHaveCount(2);
  expectNear(await centreOf(points(page).nth(1)), moved);
  expectNear(await centreOf(points(page).nth(0)), a);
  await expect(mapRegion(page).locator("path.point.point-selected")).toHaveCount(0);
});
