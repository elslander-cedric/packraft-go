// Acceptance tests for #19 (tester): a click right after a drag is never lost,
// and the click the browser sends at the end of a drag never adds or selects a point.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

type Px = { x: number; y: number };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const selected = (page: Page) => mapRegion(page).locator("path.point.point-selected");
const deleteButton = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });

async function openMap(page: Page) {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** Press, move and release with no pause at the end. */
async function drag(page: Page, from: Px, to: Px) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** A busy main thread: zero-delay timers run long after queued input. */
async function busyPage(page: Page) {
  await page.addInitScript(() => {
    const original = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      original(handler, timeout ? timeout : 500, ...args)) as typeof window.setTimeout;
  });
}

for (const busy of [false, true]) {
  const when = busy ? " (busy page)" : "";

  test(`clicking the empty map right after dragging a point adds exactly one point${when}`, async ({ page }) => {
    if (busy) await busyPage(page);
    const { cx, cy } = await openMap(page);
    const a = { x: cx - 150, y: cy };
    const b = { x: cx + 150, y: cy };
    const moved = { x: cx + 150, y: cy + 100 };
    const empty = { x: cx, y: cy - 120 };
    for (const p of [a, b]) await page.mouse.click(p.x, p.y);
    await expect(points(page)).toHaveCount(2);

    await drag(page, b, moved);
    await page.mouse.click(empty.x, empty.y);
    // The drag's own click added nothing; the planner's click added one point.
    await expect(points(page)).toHaveCount(3);
  });

  test(`the leftover click of a drag is ignored, even if nothing follows it${when}`, async ({ page }) => {
    if (busy) await busyPage(page);
    const { cx, cy } = await openMap(page);
    const a = { x: cx - 150, y: cy };
    const b = { x: cx + 150, y: cy };
    for (const p of [a, b]) await page.mouse.click(p.x, p.y);
    await expect(points(page)).toHaveCount(2);

    // Long drag, released over empty map far from where it started.
    await drag(page, b, { x: cx, y: cy + 180 });
    await page.waitForTimeout(1000);
    await expect(points(page)).toHaveCount(2);
    await expect(selected(page)).toHaveCount(0);
    await expect(deleteButton(page)).toBeDisabled();

    // Released on top of another point: still no point added or selected.
    await drag(page, { x: cx, y: cy + 180 }, a);
    await page.waitForTimeout(1000);
    await expect(points(page)).toHaveCount(2);
    await expect(selected(page)).toHaveCount(0);
  });

  test(`after panning the map, an immediate click selects a point and a pan adds none${when}`, async ({ page }) => {
    if (busy) await busyPage(page);
    const { cx, cy } = await openMap(page);
    const a = { x: cx - 150, y: cy };
    await page.mouse.click(a.x, a.y);
    await expect(points(page)).toHaveCount(1);

    // Pan the map (press on empty map), then click the point where it now is.
    await drag(page, { x: cx + 100, y: cy - 100 }, { x: cx + 100, y: cy - 40 });
    await expect(points(page)).toHaveCount(1);
    const box = (await points(page).first().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(selected(page)).toHaveCount(1);
    await expect(points(page)).toHaveCount(1);
  });
}

test("a press that moves less than the drag threshold is still a click and selects the point", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  const a = { x: cx - 150, y: cy };
  const b = { x: cx + 150, y: cy };
  for (const p of [a, b]) await page.mouse.click(p.x, p.y);
  await expect(points(page)).toHaveCount(2);

  // A real drag first, so a stale "was a drag" state would show up here.
  await drag(page, b, { x: cx + 150, y: cy + 80 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 1, a.y + 1);
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(1);
  await expect(points(page)).toHaveCount(2);
});
