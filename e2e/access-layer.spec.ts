// #53: the access layer with Flanders rules: toggle, legend, coloured waters,
// detail panel, disclaimer and OpenStreetMap credit. Uses the built-in data; no
// live service is called.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const water = (page: Page, id: string) => page.locator(`path.access-record-${id}`);

/** Clicks a water's line where it is drawn: halfway along its path. */
async function clickWater(page: Page, id: string) {
  const at = await water(page, id).evaluate((path: SVGPathElement) => {
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(at.x, at.y);
}

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

  // Off at first: no waters, no legend.
  const toggle = page.getByRole("switch", { name: strings.accessLayerToggle });
  await expect(toggle).not.toBeChecked();
  await expect(map.locator("path.access-feature")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toBeChecked();

  // The legend names the four states.
  const legend = page.getByRole("region", { name: strings.accessLegendLabel });
  for (const label of Object.values(strings.accessState)) await expect(legend.getByText(label, { exact: true })).toBeVisible();

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

  // Clicking a forbidden water shows its status, reason, source and research date.
  await clickWater(page, "flanders-lier-nete-diversion");
  const detail = page.getByRole("region", { name: strings.accessDetailLabel });
  await expect(detail.getByRole("heading", { name: "Afleiding van de Nete, Lier" })).toBeVisible();
  await expect(detail.getByText(strings.accessState.forbidden, { exact: true })).toBeVisible();
  await expect(detail).toContainText("excludes the Afleiding van de Nete");
  await expect(detail.getByRole("link", { name: "De Vlaamse Waterweg, Visuris: Kano" })).toHaveAttribute(
    "href",
    "https://www.visuris.be/kano",
  );
  await expect(detail).toContainText(strings.accessResearched("2026-10-12"));

  // A click on a water opens its details; it doesn't add a point to the trip.
  await expect(map.locator("path.point")).toHaveCount(0);

  // A VMM stretch shows its text rules and a link.
  await clickWater(page, "flanders-vmm-kleine-nete");
  await expect(detail.getByRole("heading", { name: /Kleine Nete/ })).toBeVisible();
  await expect(detail.getByText(strings.accessState.open, { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: strings.accessConditionsHeading })).toBeVisible();
  await expect(detail).toContainText("Closed below 50 cm on the gauge at Retie.");
  await expect(detail.getByRole("link", { name: "VMM: paddling on the Kleine Nete" })).toBeVisible();

  await detail.getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(detail).toHaveCount(0);

  // Switching the layer off clears the waters, the legend and the credit.
  await toggle.click();
  await expect(map.locator("path.access-feature")).toHaveCount(0);
  await expect(legend).toHaveCount(0);
  await expect(page.locator(".leaflet-control-attribution")).not.toContainText("Access data");

  expect(network.blocked).toEqual([]);
});
