// Tester acceptance for #53: click behaviour with the layer on, no runtime OSM.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const water = (page: Page, id: string) => page.locator(`path.access-record-${id}`);

async function screenPointOn(page: Page, id: string, frac: number) {
  return water(page, id).evaluate((path: SVGPathElement, f: number) => {
    const p = path.getPointAtLength(path.getTotalLength() * f);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  }, frac);
}

test("with the layer on, planning still works off the coloured waters; on them it opens details", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const network = await serveOffline(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await page.getByRole("switch", { name: strings.accessLayerToggle }).click();
  await expect(water(page, "flanders-vmm-kleine-nete")).toBeVisible();

  const at = await screenPointOn(page, "flanders-vmm-kleine-nete", 0.5);
  // 40px away from the line: a point is added.
  await page.mouse.click(at.x, at.y - 60);
  const pts = map.locator("path.point, .leaflet-marker-icon");
  const afterOff = await pts.count();
  // On the line: details open, no further point.
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole("region", { name: strings.accessDetailLabel })).toBeVisible();
  expect(await pts.count()).toBe(afterOff);
  // Click 8px off the line.
  await page.mouse.click(at.x, at.y + 12);
  expect(afterOff).toBeGreaterThan(0);

  expect(network.blocked).toEqual([]);
  expect(requests.filter((u) => /overpass|openstreetmap\.org\/api/i.test(u))).toEqual([]);
});
