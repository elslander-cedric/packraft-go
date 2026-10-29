import { expect, test, type Locator, type Page } from "@playwright/test";
import { initialMapView } from "../src/map/mapConfig";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { totals, tripPanel } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });

/** Ground distance per screen pixel for Web Mercator tiles at a latitude and zoom. */
const kmPerPixel = (lat: number, zoom: number) =>
  (40075.016686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);

/** Latitude shown `dy` pixels below a pixel row at latitude `lat` (Web Mercator). */
function latitudeBelow(lat: number, dy: number, zoom: number) {
  const worldPx = 256 * 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  const y = (worldPx / (2 * Math.PI)) * (Math.PI - Math.log(Math.tan(Math.PI / 4 + rad / 2))) + dy;
  return (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / worldPx)) * 180) / Math.PI;
}

const kmShown = async (locator: Locator) => {
  const match = (await locator.textContent())?.match(/([\d.]+)\s*km/);
  if (!match) throw new Error(`no distance in "${await locator.textContent()}"`);
  return Number(match[1]);
};

// The map-scale estimate and the app's great-circle distance agree to well under 1%.
const expectWithinOneKm = (shownKm: number, expectedKm: number) =>
  expect(Math.abs(shownKm - expectedKm)).toBeLessThan(1);

test("clicking three points draws two straight hike legs and shows their distances and total", async ({
  page,
}) => {
  const network = await serveOffline(page);
  await page.goto("/");
  const map = mapRegion(page);
  await expect(map.locator("img.leaflet-tile-loaded").first()).toBeVisible();

  // Before any click: the panel is there but lists no legs.
  await expect(tripPanel(page)).toBeVisible();
  await expect(legsPanel(page).getByRole("listitem")).toHaveCount(0);

  const box = (await map.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const a = { x: cx - 150, y: cy - 100 };
  const b = { x: cx + 150, y: cy - 100 };
  const c = { x: cx + 150, y: cy + 150 };

  await page.mouse.click(a.x, a.y);
  // The start point alone makes no leg.
  await expect(legsPanel(page).getByRole("listitem")).toHaveCount(0);
  await page.mouse.click(b.x, b.y);
  await page.mouse.click(c.x, c.y);

  // Two legs drawn, each a straight line (one segment) between the clicked points.
  const legLines = map.locator(".leaflet-overlay-pane path.leg");
  await expect(legLines).toHaveCount(2);
  for (const line of await legLines.all()) {
    const d = (await line.getAttribute("d")) ?? "";
    expect(d.match(/[ML]/g)).toEqual(["M", "L"]);
  }
  const tolerance = 6; // half the stroke width plus rounding
  const first = (await legLines.nth(0).boundingBox())!;
  expect(Math.abs(first.x - a.x)).toBeLessThan(tolerance);
  expect(Math.abs(first.x + first.width - b.x)).toBeLessThan(tolerance);
  expect(Math.abs(first.y + first.height / 2 - a.y)).toBeLessThan(tolerance);
  const second = (await legLines.nth(1).boundingBox())!;
  expect(Math.abs(second.y - b.y)).toBeLessThan(tolerance);
  expect(Math.abs(second.y + second.height - c.y)).toBeLessThan(tolerance);
  expect(Math.abs(second.x + second.width / 2 - b.x)).toBeLessThan(tolerance);

  // Expected ground distances from the map scale at the opening view.
  const { center, zoom } = initialMapView;
  const latAB = latitudeBelow(center[0], a.y - cy, zoom);
  const latC = latitudeBelow(center[0], c.y - cy, zoom);
  const expectedFirst = 300 * kmPerPixel(latAB, zoom);
  const expectedSecond = 250 * kmPerPixel((latAB + latC) / 2, zoom);

  const legs = legsPanel(page).getByRole("listitem");
  await expect(legs).toHaveCount(2);
  await expect(legs.nth(0)).toContainText(strings.phone.legFigures.hike);
  await expect(legs.nth(1)).toContainText(strings.phone.legFigures.hike);
  expectWithinOneKm(await kmShown(legs.nth(0)), expectedFirst);
  expectWithinOneKm(await kmShown(legs.nth(1)), expectedSecond);

  const total = totals(page);
  expectWithinOneKm(await kmShown(total), expectedFirst + expectedSecond);

  expect(network.blocked).toEqual([]);
});
