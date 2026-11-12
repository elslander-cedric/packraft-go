// Editing the route: drag, delete, undo. Checks only what a user sees: SVG shapes on the map,
// the leg rows, the floating buttons and network traffic.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { freeMapBox, openPlanner, tripPanel, showAllLegs, leafRows } from "./support/planner";

type Px = { x: number; y: number };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("list", { name: strings.sectionsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const markers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => panel(page).locator(leafRows);
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const deleteBtn = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });
const total = async (page: Page) => (await tripPanel(page).locator(".planner-totals").textContent()) ?? "";

async function openMap(page: Page) {
  const network = await serveOffline(page);
  await openPlanner(page);
  const box = await freeMapBox(page);
  return { network, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

async function centre(shape: Locator): Promise<Px> {
  const boxB = (await shape.boundingBox())!;
  return { x: boxB.x + boxB.width / 2, y: boxB.y + boxB.height / 2 };
}

/** Both ends of a straight SVG leg, in page pixels. */
async function ends(path: Locator): Promise<[Px, Px]> {
  const pathData = (await path.getAttribute("d")) ?? "";
  const number = (pathData.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const transform = await path.evaluate((el) => {
    const matrix = (el as SVGGraphicsElement).getScreenCTM()!;
    return { a: matrix.a, d: matrix.d, e: matrix.e, f: matrix.f };
  });
  const toPage = (x: number, y: number) => ({ x: transform.a * x + transform.e, y: transform.d * y + transform.f });
  return [toPage(number[0], number[1]), toPage(number[2], number[3])];
}

const near = (pixel: Px, otherPixel: Px, tol = 4) => Math.hypot(pixel.x - otherPixel.x, pixel.y - otherPixel.y) < tol;

async function drag(page: Page, from: Px, to: Px) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  // A human pause after dropping.
  await page.waitForTimeout(100);
}

async function markerCentres(page: Page) {
  const out: Px[] = [];
  for (const locator of await markers(page).all()) {
    out.push(await centre(locator));
  }
  return out;
}

test.beforeEach(({ page }) => showAllLegs(page));

test("dragging a point moves it, the adjacent legs follow, nothing is added", async ({ page }) => {
  const { network, cx, cy } = await openMap(page);
  const pointA = { x: cx - 220, y: cy },
    pointB = { x: cx, y: cy - 90 },
    point = { x: cx + 220, y: cy };
  const to = { x: cx + 30, y: cy + 140 };
  for (const otherPoint of [pointA, pointB, point]) {
    await page.mouse.click(otherPoint.x, otherPoint.y);
  }
  await expect(markers(page)).toHaveCount(3);
  const before = await total(page);

  await drag(page, pointB, to);
  await expect(markers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(2);

  const pts = await markerCentres(page);
  expect(near(pts[1], to)).toBe(true);
  expect(near(pts[0], pointA) && near(pts[2], point)).toBe(true);
  const [l0, l1] = [await ends(legLines(page).nth(0)), await ends(legLines(page).nth(1))];
  expect(near(l0[0], pointA) && near(l0[1], to)).toBe(true);
  expect(near(l1[0], to) && near(l1[1], point)).toBe(true);
  await expect.poll(() => total(page)).not.toBe(before);

  // Dragging the end point too.
  const endTo = { x: cx + 260, y: cy - 150 };
  await drag(page, point, endTo);
  await expect(markers(page)).toHaveCount(3);
  expect(near((await ends(legLines(page).nth(1)))[1], endTo)).toBe(true);
  expect(network.blocked).toEqual([]);
});

test("clicking an existing point selects it instead of adding a point", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  const pointA = { x: cx - 150, y: cy },
    pointB = { x: cx + 150, y: cy };
  for (const point of [pointA, pointB]) {
    await page.mouse.click(point.x, point.y);
  }
  // The delete button is only shown while a point is selected.
  await expect(deleteBtn(page)).toHaveCount(0);
  await page.mouse.click(pointB.x, pointB.y);
  await expect(markers(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(1);
  await expect(deleteBtn(page)).toBeEnabled();
});

test("deleting a middle point merges its legs; deleting an end point removes its leg", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  const pixels = [
    { x: cx - 240, y: cy },
    { x: cx - 80, y: cy - 100 },
    { x: cx + 80, y: cy + 100 },
    { x: cx + 240, y: cy },
  ];
  for (const point of pixels) {
    await page.mouse.click(point.x, point.y);
  }
  await expect(rows(page)).toHaveCount(3);

  // Delete with nothing selected does nothing.
  await page.keyboard.press("Delete");
  await expect(markers(page)).toHaveCount(4);

  // Middle point via the button: one leg straight from p0 to p2.
  await page.mouse.click(pixels[1].x, pixels[1].y);
  await deleteBtn(page).click();
  await expect(markers(page)).toHaveCount(3);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText(strings.planner.legFigures.hike);
  const merged = await ends(legLines(page).nth(0));
  expect(near(merged[0], pixels[0]) && near(merged[1], pixels[2])).toBe(true);

  // End point via the keyboard.
  await page.mouse.click(pixels[3].x, pixels[3].y);
  await page.keyboard.press("Delete");
  await expect(markers(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(1);
  const last = await ends(legLines(page).nth(0));
  expect(near(last[0], pixels[0]) && near(last[1], pixels[2])).toBe(true);

  // Start point via Backspace: one point left, no legs.
  await page.mouse.click(pixels[0].x, pixels[0].y);
  await page.keyboard.press("Backspace");
  await expect(markers(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveCount(0);
});

test("draw, drag, delete, then undo repeatedly back to an empty trip", async ({ page }) => {
  const { network, cx, cy } = await openMap(page);
  await expect(undoBtn(page)).toBeDisabled();
  // Undo on an empty trip is harmless.
  await page.keyboard.press("Control+z");
  await expect(markers(page)).toHaveCount(0);

  const pointA = { x: cx - 200, y: cy },
    pointB = { x: cx, y: cy - 100 },
    point = { x: cx + 200, y: cy };
  const moved = { x: cx + 20, y: cy + 130 };
  for (const otherPoint of [pointA, pointB, point]) {
    await page.mouse.click(otherPoint.x, otherPoint.y);
  }
  const drawn = await markerCentres(page);
  await drag(page, pointB, moved);
  await page.mouse.click(point.x, point.y);
  await deleteBtn(page).click();
  await expect(markers(page)).toHaveCount(2);

  // Undo delete: the end point and its leg come back.
  await undoBtn(page).click();
  await expect(markers(page)).toHaveCount(3);
  await expect(rows(page)).toHaveCount(2);
  // Undo move: the middle point is back where it was drawn.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => near((await markerCentres(page))[1], drawn[1])).toBe(true);
  // Undo the three adds.
  await undoBtn(page).click();
  await expect(markers(page)).toHaveCount(2);
  await undoBtn(page).click();
  await expect(markers(page)).toHaveCount(1);
  await undoBtn(page).click();
  await expect(markers(page)).toHaveCount(0);
  await expect(legLines(page)).toHaveCount(0);
  await expect(undoBtn(page)).toBeDisabled();
  await expect(tripPanel(page)).toContainText(strings.sectionsPanelEmpty);

  // The map still works after all that: a click adds a point again.
  await page.mouse.click(cx, cy);
  await expect(markers(page)).toHaveCount(1);
  expect(network.blocked).toEqual([]);
});

test("panning the map still works and does not add points", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  await page.mouse.click(cx, cy);
  const start = await centre(markers(page).first());
  await drag(page, { x: cx - 150, y: cy + 150 }, { x: cx - 50, y: cy + 200 });
  await expect(markers(page)).toHaveCount(1);
  const after = await centre(markers(page).first());
  // The map follows the drag (Leaflet's inertia may carry it a bit further).
  expect(after.x - start.x).toBeGreaterThan(90);
  expect(after.y - start.y).toBeGreaterThan(40);
});
