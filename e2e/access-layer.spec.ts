// #53: the access layer with Flanders rules: toggle, legend, coloured waters,
// detail panel, disclaimer and OpenStreetMap credit. Uses the built-in data; no
// live service is called.
import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { accessWater, holdWater } from "./support/planner";
import { accessLayerItem, mapMenuButton, toggleAccessLayer } from "./support/mapMenu";

const water = accessWater;


test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test("the access layer colours Flemish exceptions and shows why on click", async ({ page }) => {
  const network = await serveOffline(page);
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator(".leaflet-container")).toBeVisible();

  // The disclaimer is always there.
  await expect(page.getByText(strings.navigationRulesNotice)).toBeVisible();

  // Off at first: no waters, no chip. (The layer is switched in the Map menu, and its legend
  // is in the chip's dialog, ADR 0034.)
  await mapMenuButton(page).click();
  await expect(accessLayerItem(page)).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(map.locator("path.access-feature")).toHaveCount(0);
  const chip = page.getByRole("button", { name: /^Access · / });
  await expect(chip).toHaveCount(0);

  await toggleAccessLayer(page);
  await mapMenuButton(page).click();
  await expect(accessLayerItem(page)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  // The legend names the four states.
  await chip.click();
  const accessDialog = page.getByRole("dialog", { name: strings.phone.accessDialogTitle });
  const legend = accessDialog.getByRole("region", { name: strings.accessLegendLabel });
  for (const label of Object.values(strings.accessState)) await expect(legend.getByText(label, { exact: true })).toBeVisible();
  await accessDialog.getByRole("button", { name: strings.phone.accessDialogClose }).click();
  await expect(accessDialog).toHaveCount(0);

  // Exceptions are red, VMM agreement stretches green.
  await expect(water(page, "flanders-lier-nete-diversion")).toHaveAttribute("stroke", "#d0021b");
  await expect(water(page, "flanders-ghent-terneuzen-canal")).toHaveAttribute("stroke", "#d0021b");
  await expect(water(page, "flanders-port-antwerp")).toHaveAttribute("fill", "#d0021b");
  await expect(water(page, "flanders-vmm-kleine-nete")).toHaveAttribute("stroke", "#1f9d55");
  // Updated: the Brussels ponds are forbidden too since #57 (7 Flemish waters + 1) (#57).
  await expect(map.locator("path.access-forbidden")).toHaveCount(8);
  await expect(map.locator('path.access-forbidden[class*="access-record-flanders-"]')).toHaveCount(7);

  // The OpenStreetMap credit for the access data joins the map credits.
  await expect(page.locator(".leaflet-control-attribution")).toContainText("Access data");
  await expect(page.locator(".leaflet-control-attribution").getByRole("link", { name: "ODbL" })).toBeVisible();

  // Holding a forbidden water shows its status, reason, source and research date.
  await holdWater(page, "flanders-lier-nete-diversion");
  const detail = page.getByRole("region", { name: strings.accessDetailLabel });
  await expect(detail.getByRole("heading", { name: "Afleiding van de Nete, Lier" })).toBeVisible();
  await expect(detail.getByText(strings.accessState.forbidden, { exact: true })).toBeVisible();
  await expect(detail).toContainText("excludes the Afleiding van de Nete");
  await expect(detail.getByRole("link", { name: "De Vlaamse Waterweg, Visuris: Kano" })).toHaveAttribute(
    "href",
    "https://www.visuris.be/kano",
  );
  await expect(detail).toContainText(strings.accessResearched("2026-10-12"));

  // Holding a water opens its details; it doesn't add a point to the trip.
  await expect(map.locator("path.point")).toHaveCount(0);

  // A VMM stretch shows its text rules and a link.
  await holdWater(page, "flanders-vmm-kleine-nete");
  await expect(detail.getByRole("heading", { name: /Kleine Nete/ })).toBeVisible();
  await expect(detail.getByText(strings.accessState.open, { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: strings.accessConditionsHeading })).toBeVisible();
  await expect(detail).toContainText("Closed below 50 cm on the gauge at Retie.");
  await expect(detail.getByRole("link", { name: "VMM: paddling on the Kleine Nete" })).toBeVisible();

  await detail.getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(detail).toHaveCount(0);

  // Switching the layer off clears the waters, the chip and the credit.
  await toggleAccessLayer(page);
  await expect(map.locator("path.access-feature")).toHaveCount(0);
  await expect(chip).toHaveCount(0);
  await expect(page.locator(".leaflet-control-attribution")).not.toContainText("Access data");

  expect(network.blocked).toEqual([]);
});
