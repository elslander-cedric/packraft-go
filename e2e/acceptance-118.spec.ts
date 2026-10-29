// Acceptance tests for #118: screen-rule cases from the removed
// phone.spec.ts / acceptance-71.spec.ts (the rule of ADR 0034 since #190), and sheet stops by drag distance.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const sheet = (page: Page) => page.getByRole("dialog", { name: strings.phone.sheetLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.phone.sheetLabel });

// Updated for ADR 0034 (#190): every screen gets the one planner. A narrow screen in portrait
// gets the bottom sheet; every other screen, touch or not, the side panel on the right.
for (const size of [
  { width: 863, height: 360 },
  { width: 1280, height: 600 },
  { width: 1000, height: 640 },
  { width: 1280, height: 800 },
]) {
  test.describe(`non-touch desktop ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: false, hasTouch: false, userAgent: devices["Desktop Chrome"].userAgent });
    test("gets the planner with the side panel", async ({ page }) => {
      await serveOffline(page);
      await page.goto("/");
      await expect(panel(page)).toBeVisible();
      await expect(sheet(page)).toHaveCount(0);
      // The desktop planner is gone.
      await expect(page.getByRole("button", { name: strings.newTripButton })).toHaveCount(0);
    });
  });
}

test("a narrow desktop window in portrait gets the sheet; widened, the side panel", async ({ page }) => {
  await serveOffline(page);
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/");
  await expect(sheet(page)).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await page.setViewportSize({ width: 641, height: 900 });
  await expect(panel(page)).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
});

test("touch screens: a phone in portrait gets the sheet; held sideways and tablets either way up, the side panel", async ({
  browser,
}) => {
  for (const [w, h, withSheet] of [
    [412, 915, true],
    [915, 412, false],
    [1280, 600, false],
    [1024, 768, false],
    [768, 1024, false],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await serveOffline(p);
    await p.goto("/");
    if (withSheet) {
      await expect(sheet(p)).toBeVisible();
      await expect(panel(p)).toHaveCount(0);
    } else {
      await expect(panel(p)).toBeVisible();
      await expect(sheet(p)).toHaveCount(0);
    }
    await ctx.close();
  }
});

test.describe("sheet stops by drag distance", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  const height = async (page: Page) => page.viewportSize()!.height - (await sheet(page).boundingBox())!.y;
  async function drag(page: Page, dy: number) {
    const box = (await sheet(page).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + dy / 2, { steps: 5 });
    await page.mouse.move(x, y + dy, { steps: 5 });
    await page.mouse.up();
  }

  test("a small drag up stays at peek; a medium drag down from full lands on half; never closes", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    const screen = page.viewportSize()!.height;
    await expect.poll(async () => Math.abs((await height(page)) - 128)).toBeLessThan(4);
    await drag(page, -20);
    await page.waitForTimeout(600);
    expect(await height(page)).toBeLessThan(200);

    await drag(page, -screen * 0.8);
    await expect.poll(() => height(page)).toBeGreaterThan(screen * 0.85);
    await drag(page, screen * 0.3);
    await expect.poll(async () => Math.abs((await height(page)) - screen * 0.5)).toBeLessThan(screen * 0.05);

    for (let i = 0; i < 3; i++) await drag(page, screen);
    await expect.poll(() => height(page)).toBeLessThan(132);
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole("tab", { name: strings.phone.tabs.legs })).toBeVisible();
  });
});
