// Layout tests must not depend on the machine's fonts. The app ships its own font; these checks
// prove it is the one in use, and that the measurements leg-row-layout.acceptance relies on
// ("a figure stays on one line", "Retry is fully visible") really fail when the layout breaks.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { showAllLegs, leafRows } from "./support/planner";

test.beforeEach(({ page }) => showAllLegs(page));

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
  return page.getByRole("list", { name: strings.sectionsPanelLabel }).locator(leafRows).first();
}

/** Lines the text `wanted` is laid out on inside `row`. */
const lines = (row: Locator, wanted: string) =>
  row.evaluate((root, width) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(width);
      if (at < 0) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + width.length);
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)))
        .size;
    }
    return -1;
  }, wanted);

test("the app's own font is loaded and used, not an operating system font", async ({ page }) => {
  await serveOffline(page, { brouter: () => TRAIL });
  const row = await twoPoints(page);
  await expect(row).toContainText(strings.climbLabel);
  expect(await row.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Inter");
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((fontFace) => fontFace.status === "loaded").map((fontFace) => fontFace.family),
  );
  expect(loaded.join()).toContain("Inter");
});

test("seeded: a figure squeezed until it wraps inside itself is caught by the measurement", async ({ page }) => {
  await serveOffline(page, { brouter: () => TRAIL });
  const row = await twoPoints(page);
  // The climb's shown value (its label is only read out).
  const figure = "100 m";
  await expect(row).toContainText(`${strings.climbLabel} ${figure}`);
  expect(await lines(row, figure)).toBe(1);
  await page.addStyleTag({
    content:
      ".planner-row-figure { white-space: normal !important; display: inline-block !important; width: 1ch !important; }",
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
      const rect = node.getBoundingClientRect();
      const aRect = node.closest("li")!.getBoundingClientRect();
      return (
        rect.left >= aRect.left - 0.5 &&
        rect.right <= aRect.right + 0.5 &&
        rect.top >= aRect.top - 0.5 &&
        rect.bottom <= aRect.bottom + 0.5
      );
    });
  expect(await fullyInside()).toBe(true);
  await row.evaluate((el) => {
    el.style.height = "4px";
  });
  expect(await fullyInside()).toBe(false);
});
