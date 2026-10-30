// #57: Brussels waters (canal, ponds, Senne, small streams) and lock markers on
// the access layer. Uses the built-in data; no live service is called.
import { expect, test, type Page } from "@playwright/test";
import { accessColours } from "../src/map/accessColours";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { toggleAccessLayer } from "./support/mapMenu";
import { freeMapCentre, mouseHold, panToPath, pointOnPath } from "./support/planner";

const water = (page: Page, id: string) => page.locator(`path.access-record-${id}`);

/**
 * Clicks a water's own shape. In Brussels the canal, ponds, streams and lock
 * markers lie close together at the start zoom, so a click by position could
 * hit a neighbour; the event goes to the shape itself instead.
 */
/** Holds a water (0.4 s) to open its details; a click there would plan (ADR 0034). */
async function holdWater(page: Page, id: string) {
  // Brussels' waters are a few pixels across and lie on each other at the opening zoom: bring
  // the water's middle to the centre of the free part of the map, zoom in there (the wheel keeps
  // the point under the mouse), hold it, and zoom back out for the next one.
  await panToPath(page, water(page, id));
  const middle = await freeMapCentre(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(0, -240);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await page.waitForTimeout(500);
  await mouseHold(page, await pointOnPath(page, water(page, id)));
  await page.mouse.wheel(0, 240);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await page.waitForTimeout(500);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("Brussels canal, ponds, Senne and streams are coloured and explained", async ({ page }) => {
  const network = await serveOffline(page);
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator(".leaflet-container")).toBeVisible();
  await toggleAccessLayer(page);

  // Open canal, forbidden ponds, unknown Senne and streams.
  await expect(water(page, "brussels-canal").first()).toHaveAttribute("stroke", accessColours.open);
  await expect(water(page, "brussels-ponds").first()).toHaveAttribute("fill", accessColours.forbidden);
  await expect(water(page, "brussels-senne").first()).toHaveAttribute("stroke", accessColours.unknown);
  await expect(water(page, "brussels-streams").first()).toHaveAttribute("stroke", accessColours.unknown);

  const detail = page.getByRole("region", { name: strings.accessDetailLabel });

  // The canal: open, with the priority, VHF and Capitainerie notes and its source.
  await holdWater(page, "brussels-canal");
  await expect(detail.getByRole("heading", { name: "Canal, Brussels" })).toBeVisible();
  await expect(detail.getByText(strings.accessState.open, { exact: true })).toBeVisible();
  await expect(detail).toContainText("Commercial traffic has priority");
  await expect(detail).toContainText("VHF");
  await expect(detail).toContainText("Capitainerie (+32 2 247 91 21)");
  await expect(detail.getByRole("link", { name: /Brussels police regulation/ }).first()).toHaveAttribute(
    "href",
    /etaamb\.openjustice\.be/,
  );
  await expect(detail).toContainText(strings.accessResearched("2026-10-12"));

  // A pond: forbidden without permission, with its source.
  await holdWater(page, "brussels-ponds");
  await expect(detail.getByRole("heading", { name: "Ponds, Brussels" })).toBeVisible();
  await expect(detail.getByText(strings.accessState.forbidden, { exact: true })).toBeVisible();
  await expect(detail).toContainText("without permission");
  await expect(detail.getByRole("link", { name: /Bruxelles Environnement/ }).first()).toBeVisible();

  // The Senne: unknown.
  await holdWater(page, "brussels-senne");
  await expect(detail.getByRole("heading", { name: "Senne (Zenne), Brussels" })).toBeVisible();
  await expect(detail.getByText(strings.accessState.unknown, { exact: true })).toBeVisible();

  // Clicking waters shows their details; it doesn't add points to the trip.
  await expect(map.locator("path.point")).toHaveCount(0);
  expect(network.blocked).toEqual([]);
});

test("locks are marked, including Anderlecht and Molenbeek, and say portage required", async ({ page }) => {
  const network = await serveOffline(page);
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator(".leaflet-container")).toBeVisible();

  // No lock markers while the layer is off.
  await expect(map.locator("path.access-lock")).toHaveCount(0);
  await toggleAccessLayer(page);
  await expect(water(page, "brussels-canal").first()).toBeVisible();

  // At the start zoom the locks would cover the waters around them: they show once zoomed in.
  await expect(map.locator("path.access-lock")).toHaveCount(0);
  const brussels = (await water(page, "brussels-canal").first().boundingBox())!;
  await page.mouse.move(brussels.x + brussels.width / 2, brussels.y + brussels.height / 2);
  // Wheel in around Brussels until the locks show (a wheel turn zooms a few levels).
  await expect(async () => {
    await page.mouse.wheel(0, -300);
    await expect(map.locator("path.access-lock-lock-way-580151104")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(map.locator("path.access-lock-lock-way-123494618")).toBeVisible();

  // The legend, in the access chip's dialog, explains the marker.
  await page.getByRole("button", { name: /^Access · / }).click();
  const accessDialog = page.getByRole("dialog", { name: strings.planner.accessDialogTitle });
  await expect(accessDialog.getByRole("region", { name: strings.accessLegendLabel })).toContainText(strings.lockLegend);
  await accessDialog.getByRole("button", { name: strings.planner.accessDialogClose }).click();
  await expect(accessDialog).toHaveCount(0);

  const detail = page.getByRole("region", { name: strings.lockDetailLabel });
  // OpenStreetMap ways of the two Brussels lock chambers.
  for (const [id, name] of [
    ["lock-way-580151104", /Anderlecht/],
    ["lock-way-123494618", /Molenbeek/],
  ] as const) {
    await map.locator(`path.access-lock-${id}`).dispatchEvent("click");
    await expect(detail.getByRole("heading", { name })).toBeVisible();
    await expect(detail).toContainText(strings.lockPortageRequired);
    await expect(detail).toContainText(strings.accessResearched("2026-10-12"));
    await expect(detail.getByRole("link", { name: /Brussels police regulation/ })).toHaveAttribute(
      "href",
      /^https:\/\//,
    );
  }

  // Closing the lock's details hides them.
  await detail.getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(detail).toBeHidden();

  // A click on a lock opens its details; it doesn't add a point to the trip.
  await expect(map.locator("path.point")).toHaveCount(0);

  expect(network.blocked).toEqual([]);
});
