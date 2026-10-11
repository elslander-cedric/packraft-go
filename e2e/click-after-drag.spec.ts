// Regression tests for #19: a click right after dragging a point must select it,
// and dragging a point must never add one.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

type Pixel = { x: number; y: number };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const selectedPoints = (page: Page) => mapRegion(page).locator("path.point.point-selected");
const deleteButton = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });

async function openMap(page: Page) {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** Drags with the mouse and clicks the dropped point straight away, with no pause in between. */
async function dragThenClick(page: Page, from: Pixel, to: Pixel) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(to.x, to.y);
}

/**
 * Makes zero-delay timers late, as they are on a busy main thread: the browser
 * runs queued input before overdue timers, so a busy page sees the next click
 * before a `setTimeout(0)` callback.
 */
async function delayZeroTimers(page: Page) {
  await page.addInitScript(() => {
    const original = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      original(handler, timeout ? timeout : 500, ...args)) as typeof window.setTimeout;
  });
}

test("a click right after a drag selects the point, even on a busy page", async ({ page }) => {
  await delayZeroTimers(page);
  const { cx, cy } = await openMap(page);
  const a = { x: cx - 150, y: cy };
  const b = { x: cx + 150, y: cy };
  const moved = { x: cx + 150, y: cy + 100 };
  for (const p of [a, b]) await page.mouse.click(p.x, p.y);
  await expect(points(page)).toHaveCount(2);

  await dragThenClick(page, b, moved);
  await expect(points(page)).toHaveCount(2);
  await expect(selectedPoints(page)).toHaveCount(1);
  await expect(deleteButton(page)).toBeEnabled();
});

// Repeats the real interaction many times (set DRAG_CLICK_PROBE_RUNS=50 for the full probe from #19).
const probeRuns = Number(process.env.DRAG_CLICK_PROBE_RUNS ?? 10);

test(`clicking a point right after dragging it always selects it (${probeRuns} tries)`, async ({ page }) => {
  test.setTimeout(30_000 + probeRuns * 2_000);
  const { cx, cy } = await openMap(page);
  const a = { x: cx - 150, y: cy };
  const spots = [
    { x: cx + 100, y: cy - 60 },
    { x: cx + 160, y: cy + 60 },
  ];
  for (const p of [a, spots[0]]) await page.mouse.click(p.x, p.y);
  await expect(points(page)).toHaveCount(2);

  for (let run = 0; run < probeRuns; run++) {
    const from = spots[run % 2];
    const to = spots[(run + 1) % 2];
    await dragThenClick(page, from, to);
    await expect(selectedPoints(page), `try ${run + 1}`).toHaveCount(1);
    await expect(deleteButton(page), `try ${run + 1}`).toBeEnabled();
    // Dragging never adds a point.
    await expect(points(page), `try ${run + 1}`).toHaveCount(2);
  }
});
