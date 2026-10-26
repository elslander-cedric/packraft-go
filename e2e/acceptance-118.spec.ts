// Acceptance tests for #118: screen-rule cases from the removed
// phone.spec.ts / acceptance-71.spec.ts, and sheet stops by drag distance.
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const sheet = (page: Page) => page.getByRole("dialog", { name: strings.phone.sheetLabel });
const newTrip = (page: Page) => page.getByRole("button", { name: strings.newTripButton });

for (const size of [
  { width: 863, height: 360 },
  { width: 1280, height: 600 },
  { width: 1000, height: 640 },
]) {
  test.describe(`non-touch desktop ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: false, hasTouch: false, userAgent: devices["Desktop Chrome"].userAgent });
    test("keeps the desktop planner", async ({ page }) => {
      await serveOffline(page);
      await page.goto("/");
      await expect(newTrip(page)).toBeVisible();
      await expect(sheet(page)).toHaveCount(0);
    });
  });
}

test("a short wide touch window (1280x600) is the phone planner; a tall touch tablet is the desktop", async ({
  browser,
}) => {
  for (const [w, h, phone] of [
    [1280, 600, true],
    [1024, 768, false],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await serveOffline(p);
    await p.goto("/");
    if (phone) {
      // Wider than tall: the side panel stands in for the sheet (#126).
      await expect(p.getByRole("complementary", { name: strings.phone.sheetLabel })).toBeVisible();
      await expect(newTrip(p)).toHaveCount(0);
    } else {
      await expect(newTrip(p)).toBeVisible();
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
