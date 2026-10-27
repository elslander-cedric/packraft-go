// Dark theme (#141): follows the system's prefers-color-scheme. Panels go dark, the map's tiles
// are dimmed (never inverted) and the route lines keep their colours.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const HIKE = "rgb(181, 73, 27)"; // #b5491b, --color-hike in both themes

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });

async function drawHikeLeg(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 80, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 80, box.y + box.height / 2);
  await expect(mapRegion(page).locator(".leaflet-overlay-pane path.leg")).toHaveCount(1);
}

const style = (page: Page, selector: string, property: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

test.describe("with the system set to dark", () => {
  test.use({ colorScheme: "dark" });

  test("panels are dark, tiles are dimmed and the hike line keeps its colour", async ({ page }) => {
    await serveOffline(page);
    await drawHikeLeg(page);

    expect(luminance(await style(page, "body", "background-color"))).toBeLessThan(0.2);
    expect(luminance(await style(page, "body", "color"))).toBeGreaterThan(0.8);
    expect(luminance(await style(page, ".leaflet-control-zoom-in", "background-color"))).toBeLessThan(0.2);

    expect(await style(page, ".leaflet-tile-pane", "filter")).toBe("brightness(0.65)");
    expect(await style(page, ".leaflet-overlay-pane", "filter")).toBe("none");

    expect(await style(page, ".leaflet-overlay-pane path.leg", "stroke")).toBe(HIKE);
    const row = legsPanel(page).getByRole("listitem").first();
    expect(await row.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(HIKE);

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
  expect(await style(page, ".leaflet-control-zoom-in", "background-color")).toBe("rgb(255, 255, 255)");
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute(
    "content",
    "#1b6fb5",
  );
});
