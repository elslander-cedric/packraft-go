// Acceptance tests for #3 (draw a route as straight lines), written from
// the issue's acceptance criteria. They observe only what a user
// sees: SVG shapes on the map, the legs panel text, and network traffic.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const markers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => panel(page).getByRole("listitem");

const km = async (locator: Locator) => {
  const text = (await locator.textContent()) ?? "";
  const m = text.match(/([\d.,]+)\s*km/);
  if (!m) throw new Error(`no distance in "${text}"`);
  return Number(m[1].replace(",", ""));
};
const totalKm = (page: Page) => km(panel(page).getByText(strings.tripTotalDistance));

async function openMap(page: Page) {
  const network = await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { network, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** Both ends of a straight SVG path ("M x y L x y"), in page pixels. */
async function lineEnds(path: Locator) {
  const d = (await path.getAttribute("d")) ?? "";
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const commands = d.match(/[A-Za-z]/g) ?? [];
  const svg = (await path.evaluate((el) => {
    const m = (el as SVGGraphicsElement).getScreenCTM()!;
    return { a: m.a, d: m.d, e: m.e, f: m.f };
  })) as { a: number; d: number; e: number; f: number };
  const toPage = (x: number, y: number) => ({ x: svg.a * x + svg.e, y: svg.d * y + svg.f });
  return { commands, start: toPage(nums[0], nums[1]), end: toPage(nums[2], nums[3]) };
}

const near = (p: { x: number; y: number }, q: { x: number; y: number }, tol = 2) =>
  Math.hypot(p.x - q.x, p.y - q.y) < tol;

test("AC1: the first click places only a start point; no leg, total stays 0", async ({ page }) => {
  const { network, cx, cy } = await openMap(page);
  await expect(panel(page)).toContainText("0.0 km");

  await page.mouse.click(cx, cy);
  await expect(markers(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
  expect(await totalKm(page)).toBe(0);
  expect(network.blocked).toEqual([]);
});

test("AC1/AC2/AC3: each click adds a point and a straight hike leg; panel lists legs and their total", async ({
  page,
}) => {
  const { network, cx, cy } = await openMap(page);
  const clicks = [
    { x: cx - 200, y: cy + 80 },
    { x: cx - 60, y: cy - 120 },
    { x: cx + 90, y: cy + 40 },
    { x: cx + 220, y: cy - 90 },
  ];

  for (const [i, c] of clicks.entries()) {
    await page.mouse.click(c.x, c.y);
    await expect(markers(page)).toHaveCount(i + 1);
    await expect(legLines(page)).toHaveCount(i);
    await expect(rows(page)).toHaveCount(i);
  }

  // Each leg is one straight segment from the previous click to the next one.
  for (let i = 0; i < clicks.length - 1; i++) {
    const { commands, start, end } = await lineEnds(legLines(page).nth(i));
    expect(commands.join("")).toBe("ML");
    expect(near(start, clicks[i])).toBe(true);
    expect(near(end, clicks[i + 1])).toBe(true);
  }

  // Panel: one row per leg, numbered, marked Hike, with a positive distance.
  const legKm: number[] = [];
  for (let i = 0; i < clicks.length - 1; i++) {
    const row = rows(page).nth(i);
    await expect(row).toContainText(strings.legLabel(i + 1));
    await expect(row).toContainText(strings.legModeHike);
    legKm.push(await km(row));
    expect(legKm[i]).toBeGreaterThan(0);
  }

  // Leg distances scale with on-screen length (same zoom, similar latitude).
  const pxLen = clicks.slice(1).map((c, i) => Math.hypot(c.x - clicks[i].x, c.y - clicks[i].y));
  const kmPerPx = legKm.map((k, i) => k / pxLen[i]);
  for (const r of kmPerPx) expect(Math.abs(r - kmPerPx[0]) / kmPerPx[0]).toBeLessThan(0.05);

  // Total equals the sum of the legs (each shown rounded to 0.1 km).
  const sum = legKm.reduce((a, b) => a + b, 0);
  expect(Math.abs((await totalKm(page)) - sum)).toBeLessThanOrEqual(0.05 * legKm.length + 0.051);

  expect(network.blocked).toEqual([]);
});

test("edge: dragging the map to pan does not add a point", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 8 });
  await page.mouse.up();
  await expect(markers(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
});

test("edge: clicking the same spot again does not break the app", async ({ page }) => {
  const { cx, cy } = await openMap(page);
  await page.mouse.click(cx - 100, cy);
  await page.mouse.click(cx + 100, cy);
  // Second click at the last point: whatever happens, the panel and map stay consistent.
  await page.mouse.click(cx + 100, cy);
  const legs = await legLines(page).count();
  await expect(rows(page)).toHaveCount(legs);
  await expect(markers(page)).toHaveCount(legs + 1);
  const sum = await Promise.all(
    Array.from({ length: legs }, (_, i) => km(rows(page).nth(i))),
  ).then((xs) => xs.reduce((a, b) => a + b, 0));
  expect(Math.abs((await totalKm(page)) - sum)).toBeLessThanOrEqual(0.2);
});
