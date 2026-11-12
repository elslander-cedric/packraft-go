// The font is served by the app itself, with no external font requests; plus a phone and dialog smoke check.
import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

test("no external font requests, font file served from own origin", async ({ page }) => {
  const net = await serveOffline(page);
  const fonts: string[] = [];
  page.on("response", (response) => {
    if (/\.(woff2?|ttf|otf)(\?|$)/.test(response.url())) {
      fonts.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(net.blocked.filter((url) => /font|woff|gstatic/i.test(url))).toEqual([]);
  expect(fonts.length).toBeGreaterThan(0);
  for (const font of fonts) {
    expect(font).toMatch(/^200 http:\/\/localhost/);
  }
  const lic = await page.request.get("/fonts/Inter-OFL.txt");
  expect(lic.status()).toBe(200);
});

test("phone viewport: font applied, no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await serveOffline(page);
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 60, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2);
  await page.evaluate(() => document.fonts.ready);
  const fam = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll("body, button, input, select, textarea, li")].map(
        (element) => element.tagName + ":" + getComputedStyle(element).fontFamily,
      ),
    ),
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
