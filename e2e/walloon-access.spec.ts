// #59: the Walloon stretches on the access layer: coloured for the selected
// date, a date selector, and a detail panel with category, hours and the
// official link. Built-in data only; no live service is called.
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

test("switching the date changes a Walloon stretch's colour, and the panel shows the rules", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const network = await serveOffline(page);
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator(".leaflet-container")).toBeVisible();
  await page.getByRole("switch", { name: strings.accessLayerToggle }).click();

  // The Lesse below Houyet (category 1.C): open 1 October to 15 March only.
  const lesse = "walloon-1C2a";
  await expect(water(page, lesse)).toBeVisible();
  const dateField = page.getByLabel(strings.accessDateLabel, { exact: true });
  // Today is the default.
  await expect(dateField).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

  await dateField.fill("2026-07-15");
  await expect(water(page, lesse)).toHaveAttribute("stroke", "#e07b00");
  await expect(water(page, lesse)).toHaveClass(/access-closed-today/);

  await dateField.fill("2026-12-15");
  await expect(water(page, lesse)).toHaveAttribute("stroke", "#1f9d55");

  // The detail panel: category, hours for that date, the official link and the date.
  await clickWater(page, lesse);
  const detail = page.getByRole("region", { name: strings.accessDetailLabel });
  await expect(detail).toContainText(strings.accessCategory("1.C"));
  await expect(detail).toContainText("Permitted hours on 2026-12-15: 10:00-17:00");
  await expect(detail).toContainText(strings.accessStatusOn("2026-12-15"));
  await expect(detail.getByRole("link", { name: "SPW: kayak status today" })).toHaveAttribute(
    "href",
    "https://kayak.spw.wallonie.be/",
  );

  // Back to July: the panel says why it is closed today.
  await dateField.fill("2026-07-15");
  await expect(detail.getByText(strings.accessState["closed-today"], { exact: true })).toBeVisible();
  await expect(detail).toContainText("Closed today: season");

  // "Today" goes back to the default date.
  await page.getByRole("button", { name: strings.accessTodayButton }).click();
  await expect(page.getByRole("button", { name: strings.accessTodayButton })).toHaveCount(0);

  expect(network.blocked).toEqual([]);
});
