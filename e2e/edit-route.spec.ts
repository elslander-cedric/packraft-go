import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
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
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { network, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
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
  const totalBefore = await legsPanel(page).getByText(strings.tripTotalDistance).textContent();

  // Drag the middle point: it moves, both legs follow, no point is added.
  await drag(page, b, moved);
  await expect(points(page)).toHaveCount(3);
  await expect(legRows(page)).toHaveCount(2);
  expectNear(await centreOf(points(page).nth(1)), moved);
  // The other points stay put (the map did not pan).
  expectNear(await centreOf(points(page).nth(0)), a);
  expectNear(await centreOf(points(page).nth(2)), c);
  const firstLeg = (await legLines(page).nth(0).boundingBox())!;  expect(Math.abs(firstLeg.y + firstLeg.height - moved.y)).toBeLessThan(6);
  await expect(legsPanel(page).getByText(strings.tripTotalDistance)).not.toHaveText(totalBefore!);

  // Clicking an existing point selects it instead of adding a point.
  await expect(deleteButton(page)).toBeDisabled();
  await page.mouse.click(moved.x, moved.y);
  await expect(points(page)).toHaveCount(3);
  await expect(mapRegion(page).locator("path.point.point-selected")).toHaveCount(1);

  // Delete it: the two legs merge into one, from a straight to c.
  await deleteButton(page).click();
  await expect(points(page)).toHaveCount(2);
  await expect(legRows(page)).toHaveCount(1);
  await expect(legRows(page).nth(0)).toContainText(strings.legModeHike);
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
  await expect(legsPanel(page).getByText(strings.tripTotalDistance)).toHaveText(totalBefore!);

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
  await drag(page, c, { x: c.x, y: c.y + 50 });
  expectNear(await centreOf(points(page).nth(0)), { x: a.x, y: a.y + 50 });
  expectNear(await centreOf(points(page).nth(1)), { x: b.x, y: b.y + 50 });
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
