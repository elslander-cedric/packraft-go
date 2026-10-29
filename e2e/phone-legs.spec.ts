// The phone Legs tab (#121, ADR 0026): a leg row tap zooms the map to its leg; rows don't open
// (#158), an info button shows a leg's access details, flow figures and aire warnings in a
// dialog; a failed row shows Retry; no mode switch on a row; the floating next leg's mode
// toggle; snap offers from a drawn paddle leg float above the sheet.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import { TRIP_KEY } from "../src/persistence/tripStorage";
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
const detailsButton = (page: Page, n: number) =>
  legRows(page)
    .nth(n - 1)
    .getByRole("button", { name: text.legDetailsButton(n) });
const detailsDialog = (page: Page) => page.getByRole("dialog", { name: /^Leg \d+ · / });
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

test("tapping a row zooms the map to its leg and doesn't open the row (#158)", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "hike", geometry: [P1, P2] }] });
  await openPhone(page);
  await openLegsTab(page);

  const first = legLines(page).nth(0);
  const widthBefore = (await first.boundingBox())!.height;
  await expect(rowButton(page, 1)).not.toHaveAttribute("aria-expanded");
  const rowHeight = (await legRows(page).nth(0).boundingBox())!.height;
  await rowButton(page, 1).click();
  // Zoomed in on the short leg, which now shows above the sheet.
  await expect.poll(async () => (await first.boundingBox())!.height).toBeGreaterThan(widthBefore * 2);
  await expect.poll(async () => isInside(first, await freeMap(page))).toBe(true);
  await expect(rowButton(page, 1)).not.toHaveAttribute("aria-expanded");
  expect((await legRows(page).nth(0).boundingBox())!.height).toBeCloseTo(rowHeight, 0);

  await rowButton(page, 2).click();
  await expect.poll(async () => isInside(legLines(page).nth(1), await freeMap(page))).toBe(true);
});

test("the tapped row is marked by the accent bar on its left; no other row has a bar, whatever its mode", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "paddle", geometry: [P1, P2] }] });
  await openPhone(page);
  await openLegsTab(page);
  const bar = (n: number) => legRows(page).nth(n).evaluate((el) => getComputedStyle(el).borderLeftColor);
  const accent = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--color-focus)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  expect([await bar(0), await bar(1)]).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
  await rowButton(page, 2).click();
  await expect(rowButton(page, 2)).toHaveAttribute("aria-current", "true");
  await expect(rowButton(page, 1)).not.toHaveAttribute("aria-current");
  expect([await bar(0), await bar(1)]).toEqual(["rgba(0, 0, 0, 0)", accent]);
  await rowButton(page, 1).click();
  await expect.poll(() => bar(0)).toBe(accent);
  expect(await bar(1)).toBe("rgba(0, 0, 0, 0)");
});

test("rows have no tint of their own and keep their background when tapped", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [P0, P1, P2], legs: [{ mode: "hike", geometry: [P0, P1] }, { mode: "paddle", geometry: [P1, P2] }] });
  await openPhone(page);
  await openLegsTab(page);
  const background = (n: number) => legRows(page).nth(n).evaluate((el) => getComputedStyle(el).backgroundColor);

  const plain = await background(0);
  expect(await background(1)).toBe(plain);
  await rowButton(page, 2).click();
  await sheetSettled(page);
  expect(await background(1)).toBe(plain);
});

test("only a row with access details or aire warnings has the info button", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [start, putIn, end], legs: [{ mode: "hike", geometry: [start, putIn] }, { mode: "paddle", geometry: [putIn, end] }] });
  await openPhone(page);
  await openLegsTab(page);
  await expect(detailsButton(page, 2)).toBeVisible();
  await expect(iconIn(detailsButton(page, 2), icons.legDetails)).toBeVisible();
  await expect(detailsButton(page, 1)).toHaveCount(0);
  await expect(legRows(page).nth(0).getByRole("button")).toHaveCount(1);
  // A big enough target, level with the access line.
  const box = (await detailsButton(page, 2).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test("a row shows its figures after their icons, without a visible leg number; tapped, it has no mode switch and keeps its headline", async ({
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

  // Tapped: no mode switch; the time stays on the headline and the figures under it don't change.
  const time = hike.locator(".phone-row-headline .phone-row-time");
  const figures = await hike.locator(".phone-row-figures").textContent();
  await hike.click();
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

test("a paddle row's info button opens its details dialog with the access and the aire warning; Close goes back to the button", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, { points: [putIn, end], legs: [{ mode: "paddle", geometry: [putIn, end] }] }, slipwayNearby());
  await openPhone(page);
  await openLegsTab(page);
  // The row shows the aire warning as an icon only (its name read out); the text is in the dialog.
  await expect(legRows(page).nth(0).locator(".access-warning-aire")).toHaveCount(0);
  await expect(legRows(page).nth(0).locator('.leg-access-icons svg[data-icon="flag"]')).toHaveCount(1);
  await expect(legRows(page).nth(0).locator(".leg-access-icons")).toContainText(strings.tripAccess.chipKind.aire);
  await rowButton(page, 1).click();
  await expect(legRows(page).nth(0).locator(".access-warning-aire")).toHaveCount(0);
  await expect(detailsDialog(page)).toHaveCount(0);

  await detailsButton(page, 1).click();
  const dialog = detailsDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(new RegExp(`^${strings.legLabel(1)} · ${strings.legModePaddle} · \\S`));
  await expect(dialog.locator(".leg-access-status")).toBeVisible();
  await expect(dialog.locator(".access-warning-aire").first()).toContainText(strings.aire.warningKind);
  await expect(dialog.locator(".access-warning-aire .access-icon svg").first()).toBeVisible();
  // The row still doesn't open behind it.
  await expect(legRows(page).nth(0).locator(".access-warning-aire")).toHaveCount(0);

  await dialog.getByRole("button", { name: text.legDetailsClose }).click();
  await expect(detailsDialog(page)).toHaveCount(0);
  await expect(detailsButton(page, 1)).toBeFocused();

  // Escape closes it too.
  await detailsButton(page, 1).click();
  await expect(detailsDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsDialog(page)).toHaveCount(0);
  await expect(detailsButton(page, 1)).toBeFocused();
});

test("the sheet lets Escape through to the page, so it reaches a dialog opened from the sheet before focus moves in", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, { points: [putIn, end], legs: [{ mode: "paddle", geometry: [putIn, end] }] });
  await openPhone(page);
  await openLegsTab(page);
  await rowButton(page, 1).focus();
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.body.dataset.escapeReached = String(!event.defaultPrevented);
    });
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).toHaveAttribute("data-escape-reached", "true");
  await expect(sheet(page)).toBeVisible();
});

test("a paddle row shows its access as icons on a line of their own under the figures, each icon once", async ({ page }) => {
  await serveOffline(page);
  await seed(page, { points: [putIn, end], legs: [{ mode: "paddle", geometry: [putIn, end] }] });
  await openPhone(page);
  await openLegsTab(page);
  const button = rowButton(page, 1);
  const status = button.locator(".leg-access-icons");
  // The status's name is read out first; nothing but the icons is visible.
  await expect(status).toHaveText(/^Access: \S/);
  await expect(status.locator(":scope > span > :not(.visually-hidden, .access-icon)")).toHaveCount(0);
  // Without access points nearby, both ends lack an aire: one flag for both.
  const names = await status.locator("svg").evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute("data-icon")));
  expect(names.length).toBeGreaterThanOrEqual(2);
  expect(new Set(names).size).toBe(names.length);
  expect(names.filter((name) => name === "flag")).toHaveLength(1);
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

test("a paddle leg's details dialog dated today shows the live flow figures", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-14T09:00:00+02:00"));
  const network = await serveOffline(page, { kiwis: kiwisFixtures("timeseries-list.json", "timeseries-values.json") });
  await seed(page, {
    points: [semois[0], semois[semois.length - 1]],
    legs: [{ mode: "paddle", geometry: semois }],
    startDate: "2026-10-14",
  });
  await openPhone(page);
  await openLegsTab(page);
  await detailsButton(page, 1).click();
  const dialog = detailsDialog(page);
  await expect(dialog).toContainText("Closed today: low flow");
  await expect(dialog).toContainText(strings.flow.gaugeAssumed("Membre"));
  await expect(dialog.getByRole("link", { name: strings.flow.credit })).toBeVisible();
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

test("a picked next leg's mode doesn't outlive New trip or Open trip", async ({ page }) => {
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

  // Open trip: the opened trip's last leg's mode.
  await nextMode(page, strings.legModePaddle).click();
  const opened = serialiseTrip({ name: "Opened", points: [P0, P1], legs: [{ mode: "hike" }] });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), choose(menu.openFile)]);
  await chooser.setFiles({ name: "trip.json", mimeType: "application/json", buffer: Buffer.from(opened) });
  // The peek shows no name (#154): wait for the opened trip in storage instead.
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").trip?.name, TRIP_KEY))
    .toBe("Opened");
  await expectNextMode(page, strings.legModeHike);
});

/** Number of lines an element's text is laid out on. */
const lineCount = (el: Locator) =>
  el.evaluate((node) => new Set([...node.getClientRects()].map((r) => Math.round(r.top))).size);

test.describe("at a narrow phone width", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("a tapped row's figures stay on one line and Retry is fully visible (#70)", async ({ page }) => {
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

test.describe("held sideways", () => {
  test.use({ viewport: { width: viewport.height, height: viewport.width } });

  test("a leg's details dialog fits the short screen with Close in reach", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-14T09:00:00+02:00"));
    await serveOffline(page, { kiwis: kiwisFixtures("timeseries-list.json", "timeseries-values.json") });
    await seed(page, {
      points: [semois[0], semois[semois.length - 1]],
      legs: [{ mode: "paddle", geometry: semois }],
      startDate: "2026-10-14",
    });
    await openPhone(page);
    // The panel opens on first load (ADR 0034).
    const panel = page.getByRole("complementary", { name: text.sheetLabel });
    await panel.getByRole("tab", { name: text.tabs.legs }).click();
    const row = page.getByRole("list", { name: strings.legsPanelLabel }).getByRole("listitem").first();
    await row.getByRole("button", { name: text.legDetailsButton(1) }).click();
    const dialog = detailsDialog(page);
    await expect(dialog).toContainText("Closed today: low flow");
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: text.legDetailsClose })).toBeInViewport({ ratio: 1 });
  });
});
