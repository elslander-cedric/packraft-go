// Acceptance tests for #27 (leg rows get more room) written
// from the ticket's criteria, at a 1280×800 desktop window, now in the one planner's
// side panel (ADR 0034). Checks are made on the rendered text, not on class names,
// so they hold for any layout that meets the criteria.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  dayCards as dayRows,
  freeMapBox,
  legRows,
  openPlanner,
  pickNextMode,
  showTab,
  totals,
  tripPanel,
} from "./support/planner";

test.use({ viewport: { width: 1280, height: 800 } });

const daysPanel = (page: Page) => tripPanel(page).getByRole("complementary", { name: strings.daysPanelLabel });
/** A figure's shown value: its text without the label only read out (e.g. "49 min"). */
const shownValue = async (figure: Locator, label: string) => (await figure.textContent())!.replace(`${label} `, "");

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
  await openPlanner(page);
  // Updated: line counts are only meaningful once the self-hosted font has loaded (#70).
  await page.evaluate(() => document.fonts.ready);
  const box = (await freeMapBox(page));
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const click = async (dx: number, dy = 0, mode?: "hike" | "paddle") => {
    if (mode) await pickNextMode(page, mode);
    await page.mouse.click(centre.x + dx, centre.y + dy);
  };
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

/** Text that is only read out (the figures' labels, the access icons' names) isn't laid out. */
const readOutOnly = ".visually-hidden, .leg-access-icons";

/** Number of distinct text lines in `scope` (text boxes whose tops are within 6 px count as one line). */
const textLineCount = (scope: Locator) =>
  scope.evaluate((root, hidden) => {
    const tops: number[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent!.trim()) continue;
      // Updated: a paddle leg's access status and warnings sit in their own block below
      // the figures and are not part of the two-line rule for the figures (#58).
      if (n.parentElement?.closest(".leg-access")) continue;
      if (n.parentElement?.closest(hidden)) continue;
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
  }, readOutOnly);

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
    await click(150, 0, "paddle");
    const hike = legRows(page).nth(0);
    const paddle = legRows(page).nth(1);
    await expect(paddle).toContainText(strings.dropLabel);
    await expect(hike).toContainText(strings.climbLabel);

    await expectFiguresUnbroken(hike, ["3.2 km", "100 m", "59 m", "49 min"]);
    await expectFiguresUnbroken(paddle, ["5.9 km", "7 m", "1 h 11 min"]);
    // Distance and time, then climb/descent/drop: at most two lines.
    expect(await textLineCount(hike)).toBeLessThanOrEqual(2);
    expect(await textLineCount(paddle)).toBeLessThanOrEqual(2);
    // The distance and the time share the first line.
    for (const row of [hike, paddle]) {
      const distance = (await row.locator(".planner-row-distance").boundingBox())!;
      const time = (await row.locator(".planner-row-time").boundingBox())!;
      expect(Math.abs(distance.y + distance.height / 2 - (time.y + time.height / 2))).toBeLessThan(6);
    }
  });

  test("a paddle leg with a rise keeps its upstream hint on one line", async ({ page }) => {
    const RISE = riverEndingAbove(5);
    await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RISE : TRAIL) });
    const { click } = await openMap(page);
    await click(-100);
    await click(100, 0, "paddle");
    const row = legRows(page).nth(0);
    const rise = "5 m?";
    await expect(row).toContainText(`${strings.planner.legFigures.rise} ${rise}`);
    await expectFiguresUnbroken(row, [rise, "1 h 11 min"]);
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
    await expectFiguresUnbroken(row, [distance, strings.legRouting]);
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
    const time = await shownValue(row.locator(".planner-row-time"), strings.planner.legFigures.time);
    expect(time).toContain("(no climb data)");
    expect(await linesOfText(row, time), "time without climb data breaks").toBe(1);
    await expectRetryUsable(page, row, net);
  });

  test("paddle leg with the longest message (no river route): Retry is whole and clickable", async ({ page }) => {
    const net = await serveOffline(page, { brouter: () => NO_ROUTE });
    const { click } = await openMap(page);
    await click(-120);
    await click(120, 0, "paddle");
    const row = legRows(page).nth(0);
    await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailedNoRiver);
    // Updated: the row also gets its access icons once the rules load (#58, #81);
    // measure Retry after they are in, not while they push it down.
    await expect(row.locator(".leg-access-icons")).toBeVisible();
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
    await click(150, 0, "paddle");
    await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
    // Updated for ADR 0034: a row shows its mode by its distance's icon, in the mode's colour.
    const look = (row: Locator) =>
      row.evaluate((el) => {
        const icon = el.querySelector(".planner-row-distance .planner-row-figure-icon")!;
        return {
          icon: icon.getAttribute("data-icon"),
          colour: getComputedStyle(icon).color,
          font: parseFloat(getComputedStyle(el).fontSize),
        };
      });
    const hike = await look(legRows(page).nth(0));
    const paddle = await look(legRows(page).nth(1));
    expect(hike.icon).not.toBe(paddle.icon);
    expect(hike.colour).not.toBe(paddle.colour);
    expect(hike.font).toBeGreaterThanOrEqual(12);
    expect(paddle.font).toBeGreaterThanOrEqual(12);
  });

  test("day and trip totals: each figure on one line, no sideways overflow, apart from the leg rows", async ({ page }) => {
    await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
    const { click, centre } = await openMap(page);
    await click(-150);
    await click(0);
    await click(150, 0, "paddle");
    await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
    // A camp at the middle point makes two days.
    await page.waitForTimeout(450);
    await page.mouse.click(centre.x, centre.y);
    await page.getByRole("button", { name: strings.campButton }).click();
    await showTab(page, strings.planner.tabs.days);
    await expect(dayRows(page)).toHaveCount(2);

    for (const day of await dayRows(page).all()) {
      for (const figure of await day.locator(".day-figure").all()) {
        const label = (await figure.locator(".visually-hidden").textContent())!.trim();
        const value = await shownValue(figure, label);
        expect(await linesOfText(figure, value), `day figure "${label} ${value}" breaks`).toBe(1);
      }
      expect(await day.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await day.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    expect(await daysPanel(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

    // Trip totals in the panel's header: each figure on one line, apart from the leg rows.
    const figures = totals(page).locator(".planner-total");
    await expect(figures.first()).toBeVisible();
    for (const figure of await figures.all()) {
      const label = (await figure.locator(".visually-hidden").textContent())!.trim();
      const value = await shownValue(figure, label);
      expect(await linesOfText(figure, value), `"${label} ${value}" breaks`).toBe(1);
    }
    await showTab(page, strings.planner.tabs.legs);
    const firstLeg = (await legRows(page).first().boundingBox())!;
    const totalsBox = (await totals(page).boundingBox())!;
    expect(firstLeg.y - (totalsBox.y + totalsBox.height), "totals touch the leg rows").toBeGreaterThanOrEqual(8);
  });

  test("the map keeps most of a 1280 px window (desktop-first)", async ({ page }) => {
    await serveOffline(page);
    await openMap(page);
    const map = (await freeMapBox(page));
    expect(map.width).toBeGreaterThanOrEqual(800);
  });
});
