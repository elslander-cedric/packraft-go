// #211, ADR 0035: with no official reading, the computed status stands and a note says how far
// to trust it. PKAYAK and KiWIS are intercepted (ADR 0019): each is replayed from its recording
// or fails, and the page's clock is set to the recording's morning. No test calls a live service.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { mapMenuButton, toggleAccessLayer } from "./support/mapMenu";
import { kayakFixture, kiwisFixtures, serveOffline } from "./support/offline";
import { accessWater, holdWater, legDetailsDialog, openPlanner, openSectionDetails } from "./support/planner";

/** Just after each recording (see the fixtures' READMEs), in Belgian time. */
const KAYAK_RECORDED_AT = new Date("2026-11-02T10:45:00+01:00");
const KIWIS_RECORDED_AT = new Date("2026-10-14T09:00:00+02:00");
const KAYAK = kayakFixture("layer5-stretches.json");
const KIWIS = kiwisFixtures("timeseries-list.json", "timeseries-values.json");
const FAILING = () => ({ status: 503, body: "" });

const ON_KAYAK_DAY = "Mon 2 Nov 2026";
const FUTURE = "2026-11-20";
const PAST = "2026-10-20";
const NOTE = strings.official.notChecked.closures;
const { title: LINK, url: SPW } = strings.official.notCheckedLink;

/** The SPW's reason for closing the Salm below Vielsalm (1.C) in the recording. */
const DROUGHT = "En raison des étiages sévères, la circulation sur les cours d'eau de type annexe 1C est suspendue";
/** The Semois from Chassepierre (1.B): its recorded 72-hour mean is below the minimum. */
const SEMOIS = "walloon-1B4c";

const salm = [
  { lat: 50.28756, lng: 5.9139 },
  { lat: 50.28777, lng: 5.91393 },
];

async function seedSalmOn(page: Page, startDate: string) {
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Salm",
      points: salm,
      legs: [{ mode: "paddle", route: { status: "routed", geometry: salm.map((p) => ({ ...p, elevation: 300 })) } }],
      startDate,
    },
  };
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), JSON.stringify(save));
}

const seedSalmToday = (page: Page) => seedSalmOn(page, "2026-11-02");
const mapNote = (page: Page) => page.locator(".planner-map-not-checked");
const QUARTER_HOUR_MS = 15 * 60 * 1000;

/** Fails every load of the app's script chunk that holds `text`, as when offline, until released. */
async function holdChunk(page: Page, text: string) {
  let held = 0;
  let released = false;
  await page.route("**/_next/static/**/*.js", async (route) => {
    const response = await route.fetch();
    if (!released && (await response.text()).includes(text)) {
      held++;
      await route.abort();
    } else {
      await route.fulfill({ response });
    }
  });
  return { held: () => held, release: () => (released = true) };
}

test.use({ timezoneId: "Europe/Brussels" });

test.describe("at desktop size", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("a leg keeps its answer, says official closures weren't checked and links to the SPW", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING, kiwis: KIWIS });
    await seedSalmToday(page);
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);
    await expect(leg.getByRole("link", { name: LINK })).toHaveAttribute("href", SPW);
    await expect(leg.locator(".leg-access-status")).not.toContainText(strings.accessChecking);
    expect(network.kayak).toHaveLength(1);
    expect(network.blocked).toEqual([]);
  });

  test("a leg on a future date gets the note too, as a closure today can't be known then", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING });
    await seedSalmOn(page, FUTURE);
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);
    await expect(leg.getByRole("link", { name: LINK })).toHaveAttribute("href", SPW);
    expect(network.blocked).toEqual([]);
  });

  test("a leg on a past date has no closures note, and doesn't ask for today's status", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING });
    await seedSalmOn(page, PAST);
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).toBeVisible();
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
    expect(network.kayak).toEqual([]);
    expect(network.blocked).toEqual([]);
  });

  test("with the access layer on, the map itself says what wasn't checked, and links to the SPW", async ({ page }) => {
    await page.clock.setFixedTime(KIWIS_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING, kiwis: KIWIS });
    await openPlanner(page);
    await expect(mapNote(page)).toHaveCount(0);

    await toggleAccessLayer(page);
    await expect(mapNote(page)).toContainText(strings.official.mapNotChecked.closures);
    await expect(mapNote(page).getByRole("link", { name: LINK })).toHaveAttribute("href", SPW);
    await expect(mapNote(page)).toBeInViewport({ ratio: 1 });
    expect(network.blocked).toEqual([]);

    await toggleAccessLayer(page);
    await expect(mapNote(page)).toHaveCount(0);
  });

  test("with the official answers in, the map has no note", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    await serveOffline(page, { kayak: KAYAK, kiwis: KIWIS });
    await openPlanner(page);
    await toggleAccessLayer(page);

    await expect(page.locator(".planner-access-chip")).toBeVisible();
    await expect(accessWater(page, SEMOIS)).toBeAttached();
    await expect(mapNote(page)).toHaveCount(0);
  });

  test("only the note's link takes taps: the map works through the rest of it", async ({ page }) => {
    await page.clock.setFixedTime(KIWIS_RECORDED_AT);
    await serveOffline(page, { kayak: FAILING, kiwis: KIWIS });
    await openPlanner(page);
    await toggleAccessLayer(page);

    await expect(mapNote(page)).toBeVisible();
    expect(await mapNote(page).evaluate((note) => getComputedStyle(note).pointerEvents)).toBe("none");
  });

  test("a page left open asks again after 15 minutes, and a failure heals", async ({ page }) => {
    await page.clock.install({ time: KAYAK_RECORDED_AT });
    let up = false;
    const network = await serveOffline(page, { kayak: () => (up ? KAYAK() : FAILING()), kiwis: KIWIS });
    await seedSalmToday(page);
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);
    expect(network.kayak).toHaveLength(1);

    up = true;
    await page.clock.runFor(QUARTER_HOUR_MS - 60_000);
    expect(network.kayak).toHaveLength(1);
    await page.clock.runFor(61_000);
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
    await expect(leg.locator(".access-warning-closed")).toContainText(strings.official.closed(DROUGHT));
    expect(network.kayak).toHaveLength(2);
    expect(network.blocked).toEqual([]);
  });

  test("the map and the trip see the same refreshed answer, from one request", async ({ page }) => {
    await page.clock.install({ time: KAYAK_RECORDED_AT });
    let up = false;
    const network = await serveOffline(page, { kayak: () => (up ? KAYAK() : FAILING()), kiwis: KIWIS });
    await seedSalmToday(page);
    await openPlanner(page);
    await toggleAccessLayer(page);
    await expect(mapNote(page)).toContainText(strings.official.mapNotChecked.closures);
    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);

    up = true;
    await page.clock.runFor(QUARTER_HOUR_MS + 1000);
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
    await expect(mapNote(page)).toHaveCount(0);
    expect(network.kayak).toHaveLength(2);
  });

  test("with nothing left that wants it, the page stops asking", async ({ page }) => {
    await page.clock.install({ time: KAYAK_RECORDED_AT });
    const network = await serveOffline(page, { kayak: KAYAK, kiwis: KIWIS });
    await openPlanner(page);
    await toggleAccessLayer(page);
    await expect.poll(() => network.kayak.length).toBe(1);

    await toggleAccessLayer(page);
    await page.clock.runFor(2 * QUARTER_HOUR_MS);
    expect(network.kayak).toHaveLength(1);
  });

  test("with the SPW down the flows still decide on the map, under the same note", async ({ page }) => {
    await page.clock.setFixedTime(KIWIS_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING, kiwis: KIWIS });
    await openPlanner(page);
    await toggleAccessLayer(page);

    await expect(accessWater(page, SEMOIS)).toHaveClass(/access-closed-today/);
    await holdWater(page, SEMOIS);
    const detail = page.getByRole("dialog");
    await expect(detail).toContainText("Closed today: low flow");
    await expect(detail).toContainText(strings.flow.heading);
    await expect(detail.locator(".access-not-checked")).toContainText(NOTE);
    await expect(detail.getByRole("link", { name: LINK })).toHaveAttribute("href", SPW);
    expect(network.blocked).toEqual([]);
  });

  test("with the flows down the SPW still decides, and nothing says it wasn't checked", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    const network = await serveOffline(page, { kayak: KAYAK, kiwis: FAILING });
    await seedSalmToday(page);
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).toHaveText(
      strings.tripAccess.legStatusOn(ON_KAYAK_DAY, strings.accessState["closed-today"]),
    );
    await expect(leg.locator(".access-warning-closed")).toContainText(strings.official.closed(DROUGHT));
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
    expect(network.kayak).toHaveLength(1);
    expect(network.blocked).toEqual([]);
  });
});

test.describe("when a chunk won't load, at desktop size", () => {
  // The service worker would answer for the chunks, out of the test's reach.
  test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" });

  test("a PKAYAK chunk that won't load ends in the note, not Checking, and a later refresh loads it", async ({ page }) => {
    await page.clock.install({ time: KAYAK_RECORDED_AT });
    const chunk = await holdChunk(page, "PKAYAK didn't answer in time");
    const network = await serveOffline(page, { kayak: KAYAK, kiwis: KIWIS });
    await seedSalmToday(page);
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);
    await expect(leg.locator(".leg-access-status")).not.toContainText(strings.accessChecking);
    expect(chunk.held()).toBeGreaterThan(0);
    expect(network.kayak).toEqual([]);

    chunk.release();
    await page.clock.runFor(QUARTER_HOUR_MS + 1000);
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
    expect(network.kayak).toHaveLength(1);
  });

  test("a KiWIS chunk that won't load doesn't leave the status on Checking", async ({ page }) => {
    await page.clock.setFixedTime(KIWIS_RECORDED_AT);
    const chunk = await holdChunk(page, "hydrometrie.wallonie.be/services");
    await serveOffline(page, { kayak: FAILING, kiwis: KIWIS });
    await seedSalmOn(page, "2026-10-14");
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).toBeVisible();
    await expect(leg.locator(".leg-access-status")).not.toContainText(strings.accessChecking);
    expect(chunk.held()).toBeGreaterThan(0);
  });
});

test.describe("at phone size", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the map's note and its link fit the screen, under the chip and clear of the buttons", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    await serveOffline(page, { kayak: FAILING, kiwis: KIWIS, incidents: FAILING });
    await page.goto("/");
    await toggleAccessLayer(page);

    await expect(mapNote(page)).toContainText(strings.official.mapNotChecked.closures);
    await expect(mapNote(page)).toContainText(strings.official.mapNotChecked.incidents);
    await expect(mapNote(page)).toBeInViewport({ ratio: 1 });
    await expect(mapNote(page).getByRole("link", { name: LINK })).toBeInViewport({ ratio: 1 });

    const note = (await mapNote(page).boundingBox())!;
    const chip = (await page.locator(".planner-access-chip").boundingBox())!;
    const layers = (await mapMenuButton(page).boundingBox())!;
    expect(note.y).toBeGreaterThanOrEqual(chip.y + chip.height);
    expect(note.x + note.width).toBeLessThanOrEqual(layers.x);
  });

  test("the note and its link are there and fit the screen", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING, kiwis: KIWIS });
    await seedSalmToday(page);
    await page.goto("/");

    const sheet = page.getByRole("dialog", { name: strings.planner.sheetLabel });
    await sheet.getByRole("tab", { name: strings.planner.tabs.sections }).click();
    await sheet.getByRole("button", { name: strings.planner.sectionDetailsButton(1) }).click();

    const leg = legDetailsDialog(page);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);
    const link = leg.getByRole("link", { name: LINK });
    await expect(link).toHaveAttribute("href", SPW);
    await expect(link).toBeInViewport({ ratio: 1 });
    expect(network.blocked).toEqual([]);
  });

  test("a leg on a future date gets the note too", async ({ page }) => {
    await page.clock.setFixedTime(KAYAK_RECORDED_AT);
    const network = await serveOffline(page, { kayak: FAILING });
    await seedSalmOn(page, FUTURE);
    await page.goto("/");

    const sheet = page.getByRole("dialog", { name: strings.planner.sheetLabel });
    await sheet.getByRole("tab", { name: strings.planner.tabs.sections }).click();
    await sheet.getByRole("button", { name: strings.planner.sectionDetailsButton(1) }).click();

    const leg = legDetailsDialog(page);
    await expect(leg.locator(".access-not-checked")).toContainText(NOTE);
    await expect(leg.getByRole("link", { name: LINK })).toBeInViewport({ ratio: 1 });
    expect(network.blocked).toEqual([]);
  });
});
