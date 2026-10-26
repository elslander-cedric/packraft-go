/**
 * Touch gestures for end-to-end tests (#117; research: docs/research/touch-gestures-in-e2e.md).
 *
 * The gestures go through the Chrome DevTools Protocol (`Input.dispatchTouchEvent`), so the
 * browser sends its real event order: a trusted `pointerdown`, then `touchstart`, then the
 * compatibility mouse events and `click`. That is the only way a clash between our pointer
 * code and Leaflet's touch code shows up. Hand-made `PointerEvent`s never reach Leaflet and
 * hand-made `TouchEvent`s never reach our pointer code.
 *
 * Chromium only: CDP does not exist in Firefox or WebKit (the suite has one Chromium project).
 * Use it with mobile emulation (`test.use({ hasTouch: true, isMobile: true, ... })`), so the
 * page behaves as it does on a touch device. All coordinates are CSS pixels in the viewport.
 *
 * Keep gestures short: every CDP event costs about 30 ms. Avoid two taps at the same spot back
 * to back, which Chromium can read as a double-tap zoom.
 *
 * Not covered: a hold does not produce a native `contextmenu` (Chromium only does that for a
 * synthesized tap of about 800 ms); use the app's own hold timer instead.
 */
import type { Page } from "@playwright/test";

export type Pixel = { x: number; y: number };

export type TouchPoint = Pixel & { id: number };

export type Touch = {
  /** Presses a finger on `from`, drags it to `to` in `steps` moves, and lifts it. */
  drag(from: Pixel, to: Pixel, options?: { steps?: number }): Promise<void>;
  /** Presses a finger on `at`, holds it still for `ms` milliseconds, and lifts it. */
  hold(at: Pixel, ms: number): Promise<void>;
  /**
   * Two fingers, placed `spread` px apart either side of `center` (horizontally), move until
   * they are `spread * scale` apart. `scale` > 1 zooms in, < 1 zooms out.
   */
  pinch(center: Pixel, scale: number, options?: { spread?: number; steps?: number }): Promise<void>;
};

/** Opens the touch driver for a page. Throws outside Chromium. */
export async function touch(page: Page): Promise<Touch> {
  const browserName = page.context().browser()?.browserType().name();
  if (browserName !== "chromium") throw new Error(`The touch helper needs Chromium (CDP); got ${browserName}.`);
  const cdp = await page.context().newCDPSession(page);

  const send = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: TouchPoint[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const lerp = (a: Pixel, b: Pixel, t: number): Pixel => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  return {
    async drag(from, to, { steps = 10 } = {}) {
      await send("touchStart", [{ ...from, id: 1 }]);
      for (let i = 1; i <= steps; i++) await send("touchMove", [{ ...lerp(from, to, i / steps), id: 1 }]);
      await send("touchEnd", []);
    },
    async hold(at, ms) {
      await send("touchStart", [{ ...at, id: 1 }]);
      await page.waitForTimeout(ms); // a hold is a duration by definition
      await send("touchEnd", []);
    },
    async pinch(center, scale, { spread = 60, steps = 10 } = {}) {
      const ends = (half: number): [TouchPoint, TouchPoint] => [
        { x: center.x - half, y: center.y, id: 1 },
        { x: center.x + half, y: center.y, id: 2 },
      ];
      await send("touchStart", ends(spread / 2));
      for (let i = 1; i <= steps; i++) {
        const half = (spread / 2) * (1 + ((scale - 1) * i) / steps);
        await send("touchMove", ends(half));
      }
      await send("touchEnd", []);
    },
  };
}
