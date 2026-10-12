// Leg row layout at a desktop width (#27, ADR 0005). Each leg row shows its
// name, mode switch and figures without awkward wrapping, and a failed leg's
// Retry button is fully visible and usable.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const rows = (page: Page) => legsPanel(page).locator(".leg-row");
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

test.use({ viewport: { width: 1280, height: 800 } });

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** A hike leg then a paddle leg, both routed from the recordings. */
async function drawHikeThenPaddle(page: Page) {
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await rows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(rows(page).nth(1)).toContainText(strings.dropLabel);
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
}

/** True when `inner` lies wholly inside `outer` (allowing half a pixel for rounding). */
async function isInside(inner: Locator, outer: Locator) {
  const a = (await inner.boundingBox())!;
  const b = (await outer.boundingBox())!;
  return (
    a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5
  );
}

/** Number of lines an inline element's text is laid out on. */
const lineCount = (el: Locator) =>
  el.evaluate((node) => {
    const tops = new Set([...node.getClientRects()].map((r) => Math.round(r.top)));
    return tops.size;
  });

/** Every figure in a row sits on one line and inside the row. */
async function expectFiguresFit(row: Locator) {
  const figures = row.locator(".leg-figure");
  expect(await figures.count()).toBeGreaterThanOrEqual(2);
  for (const figure of await figures.all()) {
    expect(await lineCount(figure), `"${await figure.textContent()}" wraps`).toBe(1);
    expect(await isInside(figure, row), `"${await figure.textContent()}" overflows its row`).toBe(true);
  }
}

test("a failed leg's Retry button is fully visible and clickable at 1280×800", async ({ page }) => {
  // BRouter is down (the default), so the hike leg fails.
  const net = await serveOffline(page);
  const click = await openMap(page);
  await click(-120, 0);
  await click(120, 0);

  const row = rows(page).first();
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed.unavailable);
  const retry = row.getByRole("button", { name: strings.retryRouting });
  await expect(retry).toBeVisible();
  await expect(retry).toBeInViewport({ ratio: 1 });
  expect(await isInside(retry, row), "Retry sticks out of its leg row").toBe(true);
  expect(await isInside(retry, legsPanel(page)), "Retry is cut off by the legs panel").toBe(true);
  // Nothing in the panel scrolls sideways.
  const overflow = await legsPanel(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The button's centre is the button itself, not something covering it; clicking retries.
  const box = (await retry.boundingBox())!;
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(strings.retryRouting);
  const before = net.brouter.length;
  await retry.click();
  await expect.poll(() => net.brouter.length).toBe(before + 1);
});

test("a failed hike leg's figures and its time without climb data fit on their lines", async ({ page }) => {
  await serveOffline(page);
  const click = await openMap(page);
  await click(-120, 0);
  await click(120, 0);
  const row = rows(page).first();
  await expect(row.locator(".leg-time")).toContainText(strings.timeWithoutClimb(""));
  await expectFiguresFit(row);
});

test("each leg row shows its name, mode switch and figures without wrapping at 1280 px", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);

  for (const row of await rows(page).all()) {
    // The name and the mode switch share the first line of the row.
    const name = row.locator(".leg-name");
    const modeSwitch = row.getByRole("group");
    expect(await lineCount(name)).toBe(1);
    const nameBox = (await name.boundingBox())!;
    const switchBox = (await modeSwitch.boundingBox())!;
    expect(Math.abs(nameBox.y + nameBox.height / 2 - (switchBox.y + switchBox.height / 2))).toBeLessThan(6);
    expect(await isInside(modeSwitch, row)).toBe(true);
    await expectFiguresFit(row);
  }
  // The time keeps its label and value together.
  await expect(rows(page).nth(0).locator(".leg-time")).toHaveText(`${strings.legTimeEstimate} 49 min`);
});

test("hike and paddle rows stay visually distinct", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  const look = (row: Locator) =>
    row.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.borderLeftColor} ${s.backgroundColor}`;
    });
  expect(await look(rows(page).nth(0))).not.toBe(await look(rows(page).nth(1)));
});

test("the trip totals sit apart from the leg rows", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  const lastRow = (await rows(page).last().boundingBox())!;
  const total = (await legsPanel(page).locator(".trip-total").boundingBox())!;
  expect(total.y).toBeGreaterThanOrEqual(lastRow.y + lastRow.height + 8);
});
