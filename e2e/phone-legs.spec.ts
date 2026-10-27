// The phone Legs tab (#121, ADR 0026): leg rows open one at a time and zoom the map to their
// leg, an open row shows flow figures, aire warnings and Retry but no mode switch; the
// floating next leg's mode toggle; snap offers from a drawn paddle leg float above the sheet.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import { icons } from "../src/ui/icons/icons";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { iconIn } from "./support/icons";
import { brouterFixture, kiwisFixtures, serveOffline, type BRouterReply } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, timezoneId: "Europe/Brussels" });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

const text = strings.phone;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const sheet = (page: Page) => page.getByRole("dialog", { name: text.sheetLabel });
const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name });
const legRows = (page: Page) => sheet(page).getByRole("list", { name: strings.legsPanelLabel }).getByRole("listitem");
const rowButton = (page: Page, n: number) =>
  legRows(page)
    .nth(n - 1)
    .getByRole("button", { name: strings.legLabel(n), exact: false })
    .first();
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const modeSwitch = (page: Page, n: number) =>
  legRows(page)
    .nth(n - 1)
    .getByRole("group", { name: strings.legModeLabel(n) });
const nextMode = (page: Page, mode: string) =>
  page.getByRole("group", { name: text.nextLegModeLabel }).getByRole("button", { name: mode });
const offer = (page: Page) => page.getByRole("region", { name: strings.snap.label });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

type Point = { lat: number; lng: number };
type SeedLeg = { mode: "hike" | "paddle"; geometry?: readonly Point[] };

const routed = (geometry: readonly Point[]) => ({
  status: "routed",
  geometry: geometry.map((p) => ({ ...p, elevation: 200 })),
});

/** Seeds the stored trip (and optionally your access points) before the page loads. */
async function seed(
  page: Page,
  trip: { points: readonly Point[]; legs: readonly SeedLeg[]; startDate?: string },
  accessPoints?: string,
) {
  const save = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Seeded",
      points: trip.points,
      legs: trip.legs.map((leg) => ({ mode: leg.mode, ...(leg.geometry && { route: routed(leg.geometry) }) })),
      ...(trip.startDate && { startDate: trip.startDate }),
    },
  });
  await page.addInitScript(
    ([tripSave, pointsSave]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("packraft-go.trip", tripSave);
      if (pointsSave) localStorage.setItem("packraft-go.access-points", pointsSave);
    },
    [save, accessPoints ?? ""] as const,
  );
}

async function openPhone(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

async function openLegsTab(page: Page) {
  await tab(page, text.tabs.legs).click();
  await expect(legRows(page).first()).toBeVisible();
}

/** True when `inner` lies wholly inside `outer` (allowing half a pixel for rounding). */
async function isInside(inner: Locator, outer: Locator | { x: number; y: number; width: number; height: number }) {
  const a = (await inner.boundingBox())!;
  const b = "boundingBox" in outer ? (await outer.boundingBox())! : outer;
  return (
    a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5
  );
}

/** Waits for the sheet to finish sliding to its stop, so boxes measured next stay put. */
async function sheetSettled(page: Page) {
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

/** The part of the map the sheet leaves free. */
async function freeMap(page: Page) {
  const map = (await mapRegion(page).boundingBox())!;
  const top = (await sheet(page).boundingBox())!.y;
  return { x: map.x, y: map.y, width: map.width, height: top - map.y };
}

// A short leg then a long one, both routed, near Durbuy.
const P0 = { lat: 50.3, lng: 5.45 };
const P1 = { lat: 50.31, lng: 5.45 };
const P2 = { lat: 50.45, lng: 5.65 };

test("tapping a row zooms the map to its leg and opens it; opening another closes the first", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "hike", geometry: [P1, P2] }] });
  await openPhone(page);
  await openLegsTab(page);

  const first = legLines(page).nth(0);
  const widthBefore = (await first.boundingBox())!.height;
  await expect(rowButton(page, 1)).toHaveAttribute("aria-expanded", "false");
  await rowButton(page, 1).click();
  await expect(rowButton(page, 1)).toHaveAttribute("aria-expanded", "true");
  // Zoomed in on the short leg, which now shows above the sheet.
  await expect.poll(async () => (await first.boundingBox())!.height).toBeGreaterThan(widthBefore * 2);
  await expect.poll(async () => isInside(first, await freeMap(page))).toBe(true);

  await rowButton(page, 2).click();
  await expect(rowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect(rowButton(page, 1)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => isInside(legLines(page).nth(1), await freeMap(page))).toBe(true);
});

test("a paddle row has no tint of its own; only the open row's background changes, as a selected day card's does", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "paddle", geometry: [P1, P2] }] });
  await openPhone(page);
  await openLegsTab(page);
  const background = (n: number) => legRows(page).nth(n).evaluate((el) => getComputedStyle(el).backgroundColor);

  const closed = await background(0);
  expect(await background(1)).toBe(closed);

  await rowButton(page, 2).click();
  await expect(rowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => background(1)).not.toBe(closed);
  expect(await background(0)).toBe(closed);

  await rowButton(page, 1).click();
  await expect.poll(() => background(1)).toBe(closed);
  await expect.poll(() => background(0)).not.toBe(closed);
});

test("a row shows its figures after their icons, without a visible leg number; open, it has no mode switch and keeps its headline", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "paddle", geometry: [P1, P2] }] });
  await openPhone(page);
  await openLegsTab(page);
  const labels = text.legFigures;

  const hike = rowButton(page, 1);
  // The leg's number names the row for screen readers only.
  await expect(hike.getByText(strings.legLabel(1))).toHaveClass("visually-hidden");
  for (const icon of [icons.hike, icons.time, icons.climb, icons.descent]) await expect(iconIn(hike, icon)).toBeVisible();
  await expect(hike).toContainText(`${labels.climb} 0 m`);
  await expect(hike).toContainText(`${labels.descent} 0 m`);
  await expect(hike).toContainText(labels.time);

  const paddle = rowButton(page, 2);
  await expect(iconIn(paddle, icons.paddle)).toBeVisible();
  await expect(paddle).toContainText(`${labels.drop} 0 m`);
  await expect(paddle).not.toContainText(labels.climb);

  // Open: no mode switch; the time stays on the headline and the figures under it don't change.
  const time = hike.locator(".phone-row-headline .phone-row-time");
  const figures = await hike.locator(".phone-row-figures").textContent();
  await hike.click();
  await expect(hike).toHaveAttribute("aria-expanded", "true");
  await expect(modeSwitch(page, 1)).toHaveCount(0);
  await expect(legRows(page).nth(0).getByRole("button", { name: strings.legModePaddle })).toHaveCount(0);
  await expect(time).toBeVisible();
  await expect(time).toContainText(labels.time);
  await expect(hike.locator(".phone-row-figures")).toHaveText(figures!);
});

// Durbuy is in Wallonia. 0.001 degrees of latitude is about 111 m.
const putIn = { lat: 50.3527, lng: 5.4563 };
const end = { lat: 50.3627, lng: 5.4563 };
const nearby = { lat: 50.3537, lng: 5.4563 };

function slipwayNearby() {
  const now = "2026-10-14T08:00:00.000Z";
  const added = addAccessPoint([], { id: "ap1", at: nearby, now });
  return serialiseAccessPoints(updateAccessPoint(added, "ap1", { kind: "slipway", use: "put-in" }, now));
}

// A hike leg that ends at the put-in, about 111 m from your slipway.
const start = { lat: 50.3427, lng: 5.4563 };

const storedPutIn = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null")?.trip?.points?.[1]);

/** Taps the map in paddle mode: a paddle leg from the trip's end. */
async function drawPaddleLeg(page: Page) {
  await nextMode(page, strings.legModePaddle).click();
  const map = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 4);
}

test("a paddle leg drawn from a hike leg's end near your slipway offers to snap the put-in; the offer floats and can be accepted", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  await seed(page, { points: [start, putIn], legs: [{ mode: "hike", geometry: [start, putIn] }] }, slipwayNearby());
  await openPhone(page);
  await sheetSettled(page);
  const sheetTop = (await sheet(page).boundingBox())!.y;

  await drawPaddleLeg(page);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect.poll(() => network.brouter.map((url) => url.searchParams.get("profile"))).toContain("river");

  // The offer floats above the sheet, left of the bottom-right buttons; the sheet keeps its height.
  await expect(offer(page)).toBeVisible();
  await expect(sheet(page).getByRole("region", { name: strings.snap.label })).toHaveCount(0);
  const box = (await offer(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(sheetTop + 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual((await undoButton(page).boundingBox())!.x + 0.5);
  expect((await sheet(page).boundingBox())!.y).toBeCloseTo(sheetTop, 0);
  await expect(offer(page).getByRole("button", { name: strings.snap.accept })).toBeInViewport({ ratio: 1 });

  await offer(page).getByRole("button", { name: strings.snap.accept }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedPutIn(page)).toEqual(nearby);
  expect(network.blocked).toEqual([]);
});

test("a floating snap offer can be declined, which changes nothing", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await seed(page, { points: [start, putIn], legs: [{ mode: "hike", geometry: [start, putIn] }] }, slipwayNearby());
  await openPhone(page);
  await drawPaddleLeg(page);
  await offer(page).getByRole("button", { name: strings.snap.decline }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedPutIn(page)).toEqual(putIn);
});

test("an open paddle row shows the aire warning", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [putIn, end], legs: [{ mode: "paddle", geometry: [putIn, end] }] }, slipwayNearby());
  await openPhone(page);
  await openLegsTab(page);
  await expect(legRows(page).nth(0).locator(".access-warning-aire")).toHaveCount(0);
  await rowButton(page, 1).click();
  await expect(legRows(page).nth(0).locator(".access-warning-aire").first()).toContainText(strings.aire.warningKind);
  await expect(legRows(page).nth(0).locator(".access-warning-aire .access-swatch").first()).toBeVisible();
});

test("a paddle row shows its access on a line of its own under the figures, as a day row does", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [putIn, end], legs: [{ mode: "paddle", geometry: [putIn, end] }] });
  await openPhone(page);
  await openLegsTab(page);
  const button = rowButton(page, 1);
  const status = button.locator(".day-access-status");
  await expect(status).toHaveText(/^Access: \S/);
  await expect(status.locator(".access-swatch")).toHaveCount(1);
  await sheetSettled(page);
  const figures = (await button.locator(".phone-row-figures").boundingBox())!;
  expect((await status.boundingBox())!.y).toBeGreaterThanOrEqual(figures.y + figures.height);
});

/** A paddle leg along the Semois (stretch 1.B.4c), dated today; see live-walloon-flows.spec.ts. */
const semois = [
  { lat: 49.74536, lng: 5.25046 },
  { lat: 49.74547, lng: 5.24971 },
  { lat: 49.74579, lng: 5.24932 },
  { lat: 49.74665, lng: 5.24897 },
];

test("an open paddle row dated today shows the live flow figures", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-14T09:00:00+02:00"));
  const network = await serveOffline(page, { kiwis: kiwisFixtures("timeseries-list.json", "timeseries-values.json") });
  await seed(page, {
    points: [semois[0], semois[semois.length - 1]],
    legs: [{ mode: "paddle", geometry: semois }],
    startDate: "2026-10-14",
  });
  await openPhone(page);
  await openLegsTab(page);
  await rowButton(page, 1).click();
  const row = legRows(page).nth(0);
  await expect(row).toContainText("Closed today: low flow");
  await expect(row).toContainText(strings.flow.gaugeAssumed("Membre"));
  await expect(row.getByRole("link", { name: strings.flow.credit })).toBeVisible();
  expect(network.blocked).toEqual([]);
});

test("a failed leg shows its failure with Retry, and Retry routes it again", async ({ page }) => {
  let up = false;
  const network = await serveOffline(page, { brouter: () => (up ? TRAIL : { status: 503, body: "" }) });
  await seed(page, { points: [P0, P1], legs: [{ mode: "hike" }] });
  await openPhone(page);
  await openLegsTab(page);
  const row = legRows(page).nth(0);
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed.unavailable);

  up = true;
  await row.getByRole("button", { name: strings.retryRouting }).click();
  await expect(legLines(page).first()).toHaveClass(/leg-routed/);
  await expect(row.getByRole("button", { name: strings.retryRouting })).toHaveCount(0);
  expect(network.brouter.length).toBe(2);
});

test("the next leg's mode starts at the last leg's mode; switching it makes the next leg that mode", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await seed(page, { points: [P0, P1], legs: [{ mode: "paddle", geometry: [P0, P1] }] });
  await openPhone(page);
  await expect(nextMode(page, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
  // Icon-only, like the other floating buttons, with the modes as accessible names.
  await expect(nextMode(page, strings.legModeHike)).toHaveText("");
  await expect(iconIn(nextMode(page, strings.legModeHike), icons.hike)).toBeVisible();
  await expect(iconIn(nextMode(page, strings.legModePaddle), icons.paddle)).toBeVisible();

  await nextMode(page, strings.legModeHike).click();
  const map = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 4);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-hike/);
  await expect(nextMode(page, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
});

test("a new trip's next leg's mode is hike", async ({ page }) => {
  await serveOffline(page);
  await openPhone(page);
  await expect(nextMode(page, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
});

/** Expects the next leg's mode toggle to show `mode` pressed. */
const expectNextMode = (page: Page, mode: string) =>
  expect(nextMode(page, mode)).toHaveAttribute("aria-pressed", "true");

test("a picked next leg's mode doesn't outlive a delete or an undo: it is the last leg's mode again", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  await seed(page, {
    points: [P0, P1, P2],
    legs: [
      { mode: "paddle", geometry: [P0, P1] },
      { mode: "paddle", geometry: [P1, P2] },
    ],
  });
  await openPhone(page);
  const hits = mapRegion(page).locator("path.point-hit");
  await expect(hits).toHaveCount(3);

  await nextMode(page, strings.legModeHike).click();
  await expectNextMode(page, strings.legModeHike);
  const box = (await hits.nth(2).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: strings.deletePointButton }).click();
  await expect(hits).toHaveCount(2);
  await expectNextMode(page, strings.legModePaddle);

  await nextMode(page, strings.legModeHike).click();
  await undoButton(page).click();
  await expect(hits).toHaveCount(3);
  await expectNextMode(page, strings.legModePaddle);
});

test("on an empty trip, a picked next leg's mode holds over the first point to the first leg", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await openPhone(page);
  await nextMode(page, strings.legModePaddle).click();
  const map = (await mapRegion(page).boundingBox())!;
  await page.touchscreen.tap(map.x + map.width / 3, map.y + map.height / 4);
  await expectNextMode(page, strings.legModePaddle);
  await page.touchscreen.tap(map.x + (map.width * 2) / 3, map.y + map.height / 4);
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page).first()).toHaveClass(/leg-paddle/);
});

test("a picked next leg's mode doesn't outlive New trip or Open…", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await seed(page, { points: [P0, P1], legs: [{ mode: "hike", geometry: [P0, P1] }] });
  await openPhone(page);
  const menu = text.menu;
  const choose = async (name: string) => {
    await page.getByRole("button", { name: menu.button }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };

  // New trip: an empty trip's next leg is a hike leg, with or without points before.
  await nextMode(page, strings.legModePaddle).click();
  await choose(menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await expectNextMode(page, strings.legModeHike);
  await nextMode(page, strings.legModePaddle).click();
  await choose(menu.newTrip);
  await expectNextMode(page, strings.legModeHike);

  // Open…: the opened trip's last leg's mode.
  await nextMode(page, strings.legModePaddle).click();
  const opened = serialiseTrip({ name: "Opened", points: [P0, P1], legs: [{ mode: "hike" }] });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), choose(menu.openFile)]);
  await chooser.setFiles({ name: "trip.json", mimeType: "application/json", buffer: Buffer.from(opened) });
  await expect(sheet(page).getByRole("heading", { name: "Opened", exact: true })).toBeVisible();
  await expectNextMode(page, strings.legModeHike);
});

/** Number of lines an element's text is laid out on. */
const lineCount = (el: Locator) =>
  el.evaluate((node) => new Set([...node.getClientRects()].map((r) => Math.round(r.top))).size);

test.describe("at a narrow phone width", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("an open row's figures stay on one line and Retry is fully visible (#70)", async ({ page }) => {
    await serveOffline(page);
    await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "paddle" }] });
    await openPhone(page);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await openLegsTab(page);
    await rowButton(page, 1).click();
    await sheetSettled(page);

    const row = legRows(page).nth(0);
    const figures = row.locator(".phone-row-figure");
    expect(await figures.count()).toBeGreaterThanOrEqual(4);
    for (const figure of await figures.all()) {
      expect(await lineCount(figure), `"${await figure.textContent()}" wraps`).toBe(1);
      expect(await isInside(figure, row), `"${await figure.textContent()}" overflows its row`).toBe(true);
    }

    const failed = legRows(page).nth(1);
    const retry = failed.getByRole("button", { name: strings.retryRouting });
    await retry.scrollIntoViewIfNeeded();
    await expect(retry).toBeInViewport({ ratio: 1 });
    expect(await isInside(retry, failed)).toBe(true);
  });
});
