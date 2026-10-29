import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

test("opening the app shows a topo map of Belgium with credits and the navigation rules notice", async ({
  page,
}) => {
  const network = await serveOffline(page);

  await page.goto("/");

  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map).toBeVisible();
  await expect(map.locator("img.leaflet-tile-loaded").first()).toBeVisible();

  // Initial view: zoom 8 tiles covering Belgium (roughly x 129-132, y 85-88 at z8).
  const initialTiles = network.tiles.filter((t) => t.z === 8);
  expect(initialTiles.length).toBeGreaterThan(0);
  expect(initialTiles.some((t) => t.x >= 129 && t.x <= 132 && t.y >= 85 && t.y <= 88)).toBe(
    true,
  );

  const attribution = page.locator(".leaflet-control-attribution");
  await expect(attribution).toContainText("OpenStreetMap");
  await expect(attribution).toContainText("OpenTopoMap");
  await expect(attribution).toContainText("BRouter");

  await expect(page.getByText(strings.navigationRulesNotice)).toBeVisible();

  // Pan: dragging the map requests tiles that weren't shown before.
  const seen = new Set(network.tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
  const box = await map.boundingBox();
  if (!box) throw new Error("map has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 300, cy, { steps: 10 });
  await page.mouse.move(cx - 600, cy, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => network.tiles.some((t) => !seen.has(`${t.z}/${t.x}/${t.y}`)))
    .toBe(true);

  // Zoom in with the wheel (the planner has no zoom buttons, ADR 0034): tiles for the next
  // zoom level are requested.
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => network.tiles.some((t) => t.z === 9)).toBe(true);

  expect(network.blocked).toEqual([]);
});
