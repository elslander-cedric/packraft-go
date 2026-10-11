// Acceptance tests for #6 (edit the route: drag, delete, undo), written by the
// tester from the issue's acceptance criteria. They observe only what a user
// sees: SVG shapes on the map, the legs panel, toolbar buttons, network traffic.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

type Px = { x: number; y: number };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const markers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => panel(page).getByRole("listitem");
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const deleteBtn = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });
const total = async (page: Page) =>
  (await panel(page).getByText(strings.tripTotalDistance).textContent()) ?? "";

async function openMap(page: Page) {
  const network = await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { network, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

async function centre(shape: Locator): Promise<Px> {
  const b = (await shape.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Both ends of a straight SVG leg, in page pixels. */
async function ends(path: Locator): Promise<[Px, Px]> {
  const d = (await path.getAttribute("d")) ?? "";
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const m = await path.evaluate((el) => {
    const c = (el as SVGGraphicsElement).getScreenCTM()!;
    return { a: c.a, d: c.d, e: c.e, f: c.f };
  });
  const toPage = (x: number, y: number) => ({ x: m.a * x + m.e, y: m.d * y + m.f });
  return [toPage(n[0], n[1]), toPage(n[2], n[3])];
}

const near = (p: Px, q: Px, tol = 4) => Math.hypot(p.x - q.x, p.y - q.y) < tol;

async function drag(page: Page, from: Px, to: Px) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  // A human pause after dropping. The app ignores the browser's post-drag click
  // for one tick, so a click within ~0 ms of the drop would be swallowed.
  await page.waitForTimeout(100);
}

async function markerCentres(page: Page) {
  const out: Px[] = [];
  for (const m of await markers(page).all()) out.push(await centre(m));
  return out;
}

test("AC1: dragging a point moves it, the adjacent legs follow, nothing is added", async ({ page }) => {
  const { network, cx, cy } = await openMap(page);
  const a = { x: cx - 220, y: cy }, b = { x: cx, y: cy - 90 }, c = { x: cx + 220, y: cy };
  const to = { x: cx + 30, y: cy + 140 };
  for (const p of [a, b, c]) await page.mouse.click(p.x, p.y);
  await expect(markers(page)).toHaveCount(3);
  const before = await total(page);

  await drag(page, b, to);
  await expect(markers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(2);

  const pts = await markerCentres(page);
  expect(near(pts[1], to)).toBe(true);
  expect(near(pts[0], a) && near(pts[2], c)).toBe(true);
  const [l0, l1] = [await ends(legLines(page).nth(0)), await ends(legLines(page).nth(1))];
  expect(near(l0[0], a) && near(l0[1], to)).toBe(true);
  expect(near(l1[0], to) && near(l1[1], c)).toBe(true);
  await expect.poll(() => total(page)).not.toBe(before);

  // Dragging the end point too.
  const endTo = { x: cx + 260, y: cy - 150 };
  await drag(page, c, endTo);
  await expect(markers(page)).toHaveCount(3);
  expect(near((await ends(legLines(page).nth(1)))[1], endTo)).toBe(true);
  expect(network.blocked).toEqual([]);
});

test("clicking an existing point selects it instead of adding a point", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  const a = { x: cx - 150, y: cy }, b = { x: cx + 150, y: cy };
  for (const p of [a, b]) await page.mouse.click(p.x, p.y);
  await expect(deleteBtn(page)).toBeDisabled();
  await page.mouse.click(b.x, b.y);
  await expect(markers(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(1);
  await expect(deleteBtn(page)).toBeEnabled();
});

test("AC2: deleting a middle point merges its legs; deleting an end point removes its leg", async ({
  page,
}) => {
  const { cx, cy } = await openMap(page);
  const p = [
    { x: cx - 240, y: cy },
    { x: cx - 80, y: cy - 100 },
    { x: cx + 80, y: cy + 100 },
    { x: cx + 240, y: cy },
  ];
  for (const q of p) await page.mouse.click(q.x, q.y);
  await expect(rows(page)).toHaveCount(3);

  // Delete with nothing selected does nothing.
  await page.keyboard.press("Delete");
  await expect(markers(page)).toHaveCount(4);

  // Middle point via the button: one leg straight from p0 to p2.
  await page.mouse.click(p[1].x, p[1].y);
  await deleteBtn(page).click();
  await expect(markers(page)).toHaveCount(3);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText(strings.legModeHike);
  const merged = await ends(legLines(page).nth(0));
  expect(near(merged[0], p[0]) && near(merged[1], p[2])).toBe(true);

  // End point via the keyboard.
  await page.mouse.click(p[3].x, p[3].y);
  await page.keyboard.press("Delete");
  await expect(markers(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(1);
  const last = await ends(legLines(page).nth(0));
  expect(near(last[0], p[0]) && near(last[1], p[2])).toBe(true);

  // Start point via Backspace: one point left, no legs.
  await page.mouse.click(p[0].x, p[0].y);
  await page.keyboard.press("Backspace");
  await expect(markers(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveCount(0);
});

test("AC3/AC6: draw, drag, delete, then undo repeatedly back to an empty trip", async ({ page }) => {
  const { network, cx, cy } = await openMap(page);
  await expect(undoBtn(page)).toBeDisabled();
  // Undo on an empty trip is harmless.
  await page.keyboard.press("Control+z");
  await expect(markers(page)).toHaveCount(0);

  const a = { x: cx - 200, y: cy }, b = { x: cx, y: cy - 100 }, c = { x: cx + 200, y: cy };
  const moved = { x: cx + 20, y: cy + 130 };
  for (const p of [a, b, c]) await page.mouse.click(p.x, p.y);
  const drawn = await markerCentres(page);
  await drag(page, b, moved);
  await page.mouse.click(c.x, c.y);
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
  await expect(panel(page)).toContainText(strings.legsPanelEmpty);

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
