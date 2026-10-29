// Acceptance tests for #53: click behaviour with the layer on, no runtime OSM.
// Updated for ADR 0034: the layer is switched on in the Map menu, and holding a water
// (0.4 s) opens its details; a click on it is a click on the map.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { toggleAccessLayer } from "./support/mapMenu";
import { serveOffline } from "./support/offline";
import { mouseHold, openPlanner, pointOnPath, tripPanel } from "./support/planner";

const water = (page: Page, id: string) => page.locator(`path.access-record-${id}`);

test("with the layer on, planning still works off the coloured waters; on them it opens details", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const network = await serveOffline(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await openPlanner(page);
  const map = page.getByRole("region", { name: strings.mapLabel });
  await toggleAccessLayer(page);
  await expect(water(page, "flanders-vmm-kleine-nete")).toBeVisible();

  const at = await pointOnPath(page, water(page, "flanders-vmm-kleine-nete"));
  // 60px away from the line: a point is added.
  await page.mouse.click(at.x, at.y - 60);
  const pts = map.locator("path.point, .leaflet-marker-icon");
  await expect(pts).toHaveCount(1);
  // Held on the line: details open, no further point.
  await mouseHold(page, at);
  await expect(tripPanel(page).getByRole("region", { name: strings.accessDetailLabel })).toBeVisible();
  await expect(pts).toHaveCount(1);
  // A click on the line plans: it adds a point.
  await page.mouse.click(at.x, at.y + 12);
  await expect(pts).toHaveCount(2);

  expect(network.blocked).toEqual([]);
  expect(requests.filter((u) => /overpass|openstreetmap\.org\/api/i.test(u))).toEqual([]);
});
