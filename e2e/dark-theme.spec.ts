// Dark theme (#141): follows the system's prefers-color-scheme. Panels go dark, the map's tiles
// are dimmed (never inverted) and the route lines keep their colours.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { freeMapBox, openPlanner } from "./support/planner";

const HIKE = "rgb(181, 73, 27)"; // #b5491b, --color-hike in both themes

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });

async function drawHikeLeg(page: Page) {
  await openPlanner(page);
  await page.evaluate(() => document.fonts.ready);
  const box = (await freeMapBox(page));
  await page.mouse.click(box.x + box.width / 2 - 80, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 80, box.y + box.height / 2);
  await expect(mapRegion(page).locator(".leaflet-overlay-pane path.leg")).toHaveCount(1);
}

const style = (page: Page, selector: string, property: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

// Rough brightness of a computed rgb() colour, 0 (black) to 1 (white).
const brightness = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

test.describe("with the system set to dark", () => {
  test.use({ colorScheme: "dark" });

  test("panels are dark, tiles are dimmed and the hike line keeps its colour", async ({ page }) => {
    await serveOffline(page);
    await drawHikeLeg(page);

    expect(brightness(await style(page, "body", "background-color"))).toBeLessThan(0.2);
    expect(brightness(await style(page, "body", "color"))).toBeGreaterThan(0.8);
    expect(brightness(await style(page, ".side-panel", "background-color"))).toBeLessThan(0.2);

    expect(await style(page, ".leaflet-tile-pane", "filter")).toBe("brightness(0.65)");
    expect(await style(page, ".leaflet-overlay-pane", "filter")).toBe("none");

    expect(await style(page, ".leaflet-overlay-pane path.leg", "stroke")).toBe(HIKE);
    // A hike row's distance icon has the hike colour.
    const icon = legsPanel(page).getByRole("listitem").first().locator(".planner-row-distance .planner-row-figure-icon");
    expect(await icon.evaluate((el) => getComputedStyle(el).color)).toBe(HIKE);

    // Native inputs and the phone's status bar follow the theme.
    expect(await style(page, "html", "color-scheme")).toBe("light dark");
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute(
      "content",
      "#1c1c1e",
    );
  });
});

test("with the system set to light, the panels and tiles look as before", async ({ page }) => {
  await serveOffline(page);
  await drawHikeLeg(page);

  expect(await style(page, "body", "background-color")).toBe("rgb(255, 255, 255)");
  expect(await style(page, ".leaflet-tile-pane", "filter")).toBe("none");
  expect(await style(page, ".side-panel", "background-color")).toBe("rgb(255, 255, 255)");
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute(
    "content",
    "#1b6fb5",
  );
});
