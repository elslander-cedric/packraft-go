// Acceptance tests for #27 (leg rows get more room), written by the tester
// from the ticket's criteria, at a 1280×800 desktop window (ADR 0005).
// Checks are made on the rendered text, not on the builder's class names,
// so they hold for any layout that meets the criteria.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

test.use({ viewport: { width: 1280, height: 800 } });

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const daysPanel = (page: Page) => page.getByRole("complementary", { name: strings.daysPanelLabel });
const dayRows = (page: Page) => daysPanel(page).getByRole("listitem");
const modeButton = (page: Page, leg: number, name: string) =>
  legRows(page)
    .nth(leg)
    .getByRole("group", { name: strings.legModeLabel(leg + 1) })
    .getByRole("button", { name });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const NO_ROUTE: BRouterReply = { status: 400, body: brouterFixture("hiking-no-route-400.txt") };

/** The Lesse recording, changed so the leg ends `rise` metres above its start. */
function riverEndingAbove(rise: number): BRouterReply {
  const doc = JSON.parse(brouterFixture("river-success.geojson"));
  const coords: number[][] = doc.features[0].geometry.coordinates;
  coords[coords.length - 1][2] = coords[0][2] + rise;
  return { status: 200, body: JSON.stringify(doc) };
}

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  // Updated: line counts are only meaningful once the self-hosted font has loaded (#70).
  await page.evaluate(() => document.fonts.ready);
  const box = (await mapRegion(page).boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const click = (dx: number, dy = 0) => page.mouse.click(centre.x + dx, centre.y + dy);
  return { click, centre };
}

/** Lines that the exact text `text` (inside `scope`) is laid out on. */
const linesOfText = (scope: Locator, text: string) =>
  scope.evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(wanted);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + wanted.length);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    }
    return -1; // not found
  }, text);

/** Number of distinct text lines in `scope` (text boxes whose tops are within 6 px count as one line). */
const textLineCount = (scope: Locator) =>
  scope.evaluate((root) => {
    const tops: number[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent!.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0) tops.push(r.top);
    }
    tops.sort((a, b) => a - b);
    let lines = 0;
    let last = -Infinity;
    for (const t of tops) {
      if (t - last > 6) lines++;
      last = t;
    }
    return lines;
  });

/** Every figure (the leg's own texts) is on one line and inside the row; the row never scrolls sideways. */
async function expectFiguresUnbroken(row: Locator, figures: string[]) {
  for (const figure of figures) {
    expect(await linesOfText(row, figure), `"${figure}" is missing or breaks across lines`).toBe(1);
  }
  const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "row overflows sideways").toBeLessThanOrEqual(0);
}

/** The visible part of `el` after clipping by every scrolling/clipping ancestor and the viewport. */
async function fullyUnclipped(el: Locator) {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    let clip = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (let a = node.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const b = a.getBoundingClientRect();
        clip = {
          top: Math.max(clip.top, b.top),
          left: Math.max(clip.left, b.left),
          right: Math.min(clip.right, b.right),
          bottom: Math.min(clip.bottom, b.bottom),
        };
      }
    }
    return r.top >= clip.top - 0.5 && r.left >= clip.left - 0.5 && r.right <= clip.right + 0.5 && r.bottom <= clip.bottom + 0.5;
  });
}

async function expectRetryUsable(page: Page, row: Locator, net: { brouter: URL[] }) {
  const retry = row.getByRole("button", { name: strings.retryRouting });
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeVisible();
  expect(await fullyUnclipped(retry), "Retry is clipped").toBe(true);
  const box = (await retry.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(16);
  // The Retry text itself fits on one line inside the button.
  expect(await linesOfText(retry, strings.retryRouting)).toBe(1);
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit, "something covers the Retry button").toBe(strings.retryRouting);
  const before = net.brouter.length;
  await retry.click();
  await expect.poll(() => net.brouter.length).toBe(before + 1);
}

test.describe("#27 leg rows at 1280×800", () => {
  test("routed hike and paddle rows: every figure on one line, each row at most two lines", async ({ page }) => {
    await serveOffline(page, {
      brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL),
    });
    const { click } = await openMap(page);
    await click(-150);
    await click(0);
    await click(150);
    await modeButton(page, 1, strings.legModePaddle).click();
    const hike = legRows(page).nth(0);
    const paddle = legRows(page).nth(1);
    await expect(paddle).toContainText(strings.dropLabel);
    await expect(hike).toContainText(strings.climbLabel);

    await expectFiguresUnbroken(hike, [
      strings.legLabel(1),
      "3.2 km",
      `${strings.climbLabel} 100 m`,
      `${strings.descentLabel} 59 m`,
      `${strings.legTimeEstimate} 49 min`,
    ]);
    await expectFiguresUnbroken(paddle, [
      strings.legLabel(2),
      "5.9 km",
      `${strings.dropLabel} 7 m`,
      `${strings.legTimeEstimate} 1 h 11 min`,
    ]);
    // Name, switch, distance, climb/descent/drop and time read as at most two lines.
    expect(await textLineCount(hike)).toBeLessThanOrEqual(2);
    expect(await textLineCount(paddle)).toBeLessThanOrEqual(2);
    // The leg name and its mode switch are on the same line.
    for (const [i, row] of [hike, paddle].entries()) {
      const name = (await row.getByText(strings.legLabel(i + 1), { exact: true }).boundingBox())!;
      const sw = (await row.getByRole("group").boundingBox())!;
      expect(Math.abs(name.y + name.height / 2 - (sw.y + sw.height / 2))).toBeLessThan(6);
    }
  });

  test("a paddle leg with a rise keeps its upstream hint on one line", async ({ page }) => {
    const RISE = riverEndingAbove(5);
    await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RISE : TRAIL) });
    const { click } = await openMap(page);
    await click(-100);
    await click(100);
    await modeButton(page, 0, strings.legModePaddle).click();
    const row = legRows(page).nth(0);
    const rise = strings.riseFigure("5 m");
    await expect(row).toContainText(rise);
    await expectFiguresUnbroken(row, [rise, `${strings.legTimeEstimate} 1 h 11 min`]);
    expect(await textLineCount(row)).toBeLessThanOrEqual(2);
  });

  test("a pending leg row stays tidy while snapping", async ({ page }) => {
    await serveOffline(page, { brouter: () => new Promise<BRouterReply>(() => {}) }); // never answers
    const { click } = await openMap(page);
    await click(-100);
    await click(100);
    const row = legRows(page).nth(0);
    await expect(row.getByRole("status")).toHaveText(strings.legRouting);
    const distance = (await row.textContent())!.match(/[\d.]+ km/)![0];
    await expectFiguresUnbroken(row, [strings.legLabel(1), distance, strings.legRouting]);
    expect(await textLineCount(row)).toBeLessThanOrEqual(3); // heading, time, snapping note
  });
});

test.describe("#27 Retry on a failed leg at 1280×800", () => {
  test("hike leg, service unavailable: message and time fit, Retry is whole and clickable", async ({ page }) => {
    const net = await serveOffline(page);
    const { click } = await openMap(page);
    await click(-120);
    await click(120);
    const row = legRows(page).nth(0);
    await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed.unavailable);
    const time = (await row.textContent())!.match(/Est\. time .*?\(no climb data\)/)![0];
    expect(await linesOfText(row, time), "time without climb data breaks").toBe(1);
    await expectRetryUsable(page, row, net);
  });

  test("paddle leg with the longest message (no river route): Retry is whole and clickable", async ({ page }) => {
    const net = await serveOffline(page, { brouter: () => NO_ROUTE });
    const { click } = await openMap(page);
    await click(-120);
    await click(120);
    await modeButton(page, 0, strings.legModePaddle).click();
    const row = legRows(page).nth(0);
    await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailedNoRiver);
    await expectRetryUsable(page, row, net);
  });

  test("with many failed legs, the last leg's Retry can be scrolled to and used, also by keyboard", async ({ page }) => {
    const net = await serveOffline(page);
    const { click } = await openMap(page);
    for (const dx of [-250, -150, -50, 50, 150, 250]) await click(dx);
    await expect(legRows(page)).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(legRows(page).nth(i).getByRole("alert")).toBeVisible();
    const last = legRows(page).nth(4);
    await expectRetryUsable(page, last, net);

    const retry = legRows(page).nth(2).getByRole("button", { name: strings.retryRouting });
    await expect(retry).toBeVisible(); // still failed after a retry of another leg
    await retry.focus();
    const before = net.brouter.length;
    await page.keyboard.press("Enter");
    await expect.poll(() => net.brouter.length).toBe(before + 1);
  });
});

test.describe("#27 hike and paddle rows, totals at 1280×800", () => {
  test("hike and paddle rows look different and both are readable", async ({ page }) => {
    await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
    const { click } = await openMap(page);
    await click(-150);
    await click(0);
    await click(150);
    await modeButton(page, 1, strings.legModePaddle).click();
    await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
    const look = (row: Locator) =>
      row.evaluate((el) => {
        const s = getComputedStyle(el);
        return { border: s.borderLeftColor, width: s.borderLeftWidth, bg: s.backgroundColor, font: parseFloat(s.fontSize) };
      });
    const hike = await look(legRows(page).nth(0));
    const paddle = await look(legRows(page).nth(1));
    expect(hike.border).not.toBe(paddle.border);
    expect(hike.bg).not.toBe(paddle.bg);
    expect(hike.font).toBeGreaterThanOrEqual(12);
    expect(paddle.font).toBeGreaterThanOrEqual(12);
  });

  test("day and trip totals: each figure on one line, no sideways overflow, apart from the leg rows", async ({ page }) => {
    await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
    const { click, centre } = await openMap(page);
    await click(-150);
    await click(0);
    await click(150);
    await modeButton(page, 1, strings.legModePaddle).click();
    await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
    // A camp at the middle point makes two days.
    await page.mouse.click(centre.x, centre.y);
    await page.getByRole("button", { name: strings.campButton }).click();
    await expect(dayRows(page)).toHaveCount(2);

    for (const day of await dayRows(page).all()) {
      const text = (await day.textContent())!;
      for (const label of [
        strings.dayHikeDistance,
        strings.dayPaddleDistance,
        strings.climbLabel,
        strings.descentLabel,
        strings.dayTimeEstimate,
      ]) {
        const figure = text.match(new RegExp(`${label.replace(/[.]/g, "\\.")} [\\d.]+(?: h \\d+ min| min| km| m)`))![0];
        expect(await linesOfText(day, figure), `day figure "${figure}" breaks`).toBe(1);
      }
      expect(await day.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await day.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    expect(await daysPanel(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

    // Trip totals: each on one line, and set apart from the last leg row.
    const panel = legsPanel(page);
    for (const label of [strings.tripTotalDistance, strings.tripTotalTimeEstimate]) {
      const line = panel.getByText(label);
      await line.scrollIntoViewIfNeeded();
      await expect(line).toBeVisible();
      const text = (await line.textContent())!;
      expect(await linesOfText(line, text), `"${text}" breaks`).toBe(1);
    }
    const total = panel.getByText(strings.tripTotalDistance);
    const lastLeg = (await legRows(page).last().boundingBox())!;
    const totalBox = (await total.boundingBox())!;
    const ruled = await total.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0);
    const gap = totalBox.y - (lastLeg.y + lastLeg.height);
    expect(gap >= 8 || ruled, `totals touch the leg rows (gap ${gap}px, no rule)`).toBe(true);
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  test("the map keeps most of a 1280 px window (desktop-first)", async ({ page }) => {
    await serveOffline(page);
    await openMap(page);
    const map = (await mapRegion(page).boundingBox())!;
    expect(map.width).toBeGreaterThanOrEqual(800);
  });
});
