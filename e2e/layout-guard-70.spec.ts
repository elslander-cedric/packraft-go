// #70: layout tests must not depend on the machine's fonts. The app ships its
// own font; these checks prove it is the one in use, and that the measurements
// acceptance-27 relies on ("a figure stays on one line", "Retry is fully
// visible") really fail when the layout breaks (seeded cases).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";

test.use({ viewport: { width: 1280, height: 800 } });

const TRAIL = { status: 200, body: brouterFixture("hiking-success.geojson") };

async function twoPoints(page: Page) {
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 150, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 150, box.y + box.height / 2);
  return page.getByRole("complementary", { name: strings.legsPanelLabel }).getByRole("listitem").first();
}

/** Lines the text `wanted` is laid out on inside `row`. */
const lines = (row: Locator, wanted: string) =>
  row.evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(w);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + w.length);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    }
    return -1;
  }, wanted);

test("the app's own font is loaded and used, not an operating system font", async ({ page }) => {
  await serveOffline(page, { brouter: () => TRAIL });
  const row = await twoPoints(page);
  await expect(row).toContainText(strings.climbLabel);
  expect(await row.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Inter");
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
  expect(loaded.join()).toContain("Inter");
});

test("seeded: a figure squeezed until it wraps inside itself is caught by the measurement", async ({ page }) => {
  await serveOffline(page, { brouter: () => TRAIL });
  const row = await twoPoints(page);
  const figure = `${strings.climbLabel} 100 m`;
  await expect(row).toContainText(figure);
  expect(await lines(row, figure)).toBe(1);
  await page.addStyleTag({
    content: ".leg-figure { white-space: normal !important; display: inline-block !important; width: 1ch !important; }",
  });
  expect(await lines(row, figure)).toBeGreaterThan(1);
});

test("seeded: a Retry button cut off by its container is caught by the measurement", async ({ page }) => {
  await serveOffline(page); // default replies: the service is unavailable
  const row = await twoPoints(page);
  const retry = row.getByRole("button", { name: strings.retryRouting });
  await expect(retry).toBeVisible();
  const fullyInside = () =>
    retry.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const c = node.closest("li")!.getBoundingClientRect();
      return r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5;
    });
  expect(await fullyInside()).toBe(true);
  await row.evaluate((el) => {
    el.style.height = "4px";
  });
  expect(await fullyInside()).toBe(false);
});
