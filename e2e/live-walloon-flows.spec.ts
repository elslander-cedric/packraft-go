// #61: live Walloon flows. KiWIS is intercepted (ADR 0019): recorded answers
// are replayed, and the page's clock is set to the recording's morning so the
// readings are today's. No test calls the live service.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { delayedKiwis, kiwisFixtures, serveOffline } from "./support/offline";

/** Just after the recording (see src/hydrometry/fixtures/README.md), in Belgian time. */
const RECORDED_AT = new Date("2026-10-14T09:00:00+02:00");
const RECORDED = kiwisFixtures("timeseries-list.json", "timeseries-values.json");
const FAILING = () => ({ status: 503, body: "" });

/**
 * The Semois from Chassepierre bridge to the Deleau mill (1.B): its gauge,
 * Membre, is an assumed match, and its recorded 72-hour mean (1.407 m³/s) is
 * below the minimum of 2.2.
 */
const SEMOIS = "walloon-1B4c";
/** The Amblève from the Warche confluence (1.B, gauge Stavelot): within its limits. */
const AMBLEVE = "walloon-1B1a";

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

const water = (page: Page, id: string) => page.locator(`path.access-record-${id}`);

/** Clicks a water's line where it is drawn: halfway along its path. */
async function clickWater(page: Page, id: string) {
  const at = await water(page, id).evaluate((path: SVGPathElement) => {
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(at.x, at.y);
}

async function openAccessLayer(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("region", { name: strings.mapLabel }).locator(".leaflet-container")).toBeVisible();
  await page.getByRole("switch", { name: strings.accessLayerToggle }).click();
}

const detail = (page: Page) => page.getByRole("region", { name: strings.accessDetailLabel });

test("a stretch closes on low flow today, with flow figures, freshness, the assumed gauge and the SPW credit", async ({
  page,
}) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kiwis: RECORDED });
  await openAccessLayer(page);

  await expect(water(page, SEMOIS)).toHaveClass(/access-closed-today/);
  await expect(water(page, AMBLEVE)).toHaveClass(/access-open/);
  await clickWater(page, SEMOIS);
  const panel = detail(page);
  await expect(panel).toContainText("Closed today: low flow");
  await expect(panel).toContainText(strings.flow.heading);
  await expect(panel).toContainText(strings.flow.gaugeAssumed("Membre"));
  await expect(panel).toContainText(strings.flow.at8("1.3 m³/s"));
  await expect(panel).toContainText(strings.flow.mean72h("1.41 m³/s", "Wed 14 Oct 2026, 01:00"));
  await expect(panel).toContainText(strings.flow.minimum("2.2 m³/s"));
  await expect(panel).toContainText(strings.flow.maximum("50 m³/s"));
  await expect(panel).toContainText(strings.flow.lastMeasured("Wed 14 Oct 2026, 08:00"));
  await expect(panel.getByRole("link", { name: strings.flow.credit })).toHaveAttribute(
    "href",
    "https://hydrometrie.wallonie.be/",
  );

  // Another date has no live flow: the rules alone decide, without figures.
  await page.getByLabel(strings.accessDateLabel, { exact: true }).fill("2026-10-20");
  await expect(panel).toContainText(strings.accessStatusOn("2026-10-20"));
  await expect(water(page, SEMOIS)).toHaveClass(/access-open/);
  await expect(panel.getByText(strings.flow.heading)).toHaveCount(0);

  // At most two requests, whatever is shown.
  expect(network.kiwis.length).toBeLessThanOrEqual(2);
  expect(network.blocked).toEqual([]);
});

test("a flow-dependent stretch shows unknown today when the service fails, with the SPW kayak link", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kiwis: FAILING });
  await openAccessLayer(page);

  await expect(water(page, SEMOIS)).toHaveClass(/access-unknown/);
  await clickWater(page, SEMOIS);
  await expect(detail(page)).toContainText("Flow unknown: the live flow service is unavailable");
  await expect(detail(page).getByRole("link", { name: "SPW: kayak status today" })).toHaveAttribute(
    "href",
    "https://kayak.spw.wallonie.be/",
  );
  // A failure is cached: the service isn't asked again and again.
  expect(network.kiwis).toHaveLength(1);
  expect(network.blocked).toEqual([]);
});

/** A paddle leg along the Semois (stretch 1.B.4c), dated today. */
const semois = [
  { lat: 49.74536, lng: 5.25046 },
  { lat: 49.74547, lng: 5.24971 },
  { lat: 49.74579, lng: 5.24932 },
  { lat: 49.74665, lng: 5.24897 },
];

test("a paddle leg dated today uses the live flow: closed on low flow, with the figures", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  await serveOffline(page, { kiwis: RECORDED });
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Semois today",
      points: [semois[0], semois[semois.length - 1]],
      legs: [{ mode: "paddle", route: { status: "routed", geometry: semois.map((p) => ({ ...p, elevation: 200 })) } }],
      startDate: "2026-10-14",
    },
  };
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), JSON.stringify(save));
  await page.goto("/");

  const leg = page.getByRole("complementary", { name: strings.legsPanelLabel }).locator(".leg-row").first();
  await expect(leg.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Wed 14 Oct 2026", strings.accessState["closed-today"]),
  );
  await expect(leg.locator(".access-warning-closed")).toContainText("Closed today: low flow");
  await expect(leg).toContainText(strings.flow.gaugeAssumed("Membre"));
  await expect(leg.getByRole("link", { name: strings.flow.credit })).toBeVisible();
});

/** Saves the Semois leg dated today as the current trip. */
async function seedSemoisToday(page: Page) {
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Semois today",
      points: [semois[0], semois[semois.length - 1]],
      legs: [{ mode: "paddle", route: { status: "routed", geometry: semois.map((p) => ({ ...p, elevation: 200 })) } }],
      startDate: "2026-10-14",
    },
  };
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), JSON.stringify(save));
}

test("a leg dated today shows Checking flow first, then closed; never open in between (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(RECORDED);
  const network = await serveOffline(page, { kiwis: held.kiwis });
  await seedSemoisToday(page);
  await page.goto("/");

  const leg = page.getByRole("complementary", { name: strings.legsPanelLabel }).locator(".leg-row").first();
  const status = leg.locator(".leg-access-status");
  // The answer is held: the leg must be checking, and the request must really be in flight.
  await expect(status).toHaveText(
    strings.tripAccess.legStatusOn("Wed 14 Oct 2026", strings.accessChecking),
  );
  await expect.poll(() => network.kiwis.length).toBeGreaterThan(0);
  await expect(status).not.toContainText(strings.accessState.open);

  held.release();
  await expect(status).toHaveText(
    strings.tripAccess.legStatusOn("Wed 14 Oct 2026", strings.accessState["closed-today"]),
  );
});

test("the map's stretch detail shows Checking flow while the flows load, then closed (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(RECORDED);
  const network = await serveOffline(page, { kiwis: held.kiwis });
  await openAccessLayer(page);

  await expect(water(page, SEMOIS)).toHaveClass(/access-checking/);
  await expect.poll(() => network.kiwis.length).toBeGreaterThan(0);
  await clickWater(page, SEMOIS);
  await expect(detail(page)).toContainText(strings.accessChecking);
  await expect(detail(page).getByText(strings.accessState.open, { exact: true })).toHaveCount(0);

  held.release();
  await expect(water(page, SEMOIS)).toHaveClass(/access-closed-today/);
  await expect(detail(page)).toContainText("Closed today: low flow");
});

test("a failing flow service still ends in unknown after checking (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(FAILING);
  await serveOffline(page, { kiwis: held.kiwis });
  await seedSemoisToday(page);
  await page.goto("/");

  const leg = page.getByRole("complementary", { name: strings.legsPanelLabel }).locator(".leg-row").first();
  await expect(leg.locator(".leg-access-status")).toContainText(strings.accessChecking);
  held.release();
  await expect(leg.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Wed 14 Oct 2026", strings.accessState.unknown),
  );
});

test("a day with one held flow-dependent leg and one open leg never reads open while held (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(RECORDED);
  await serveOffline(page, { kiwis: held.kiwis });
  // Leg 1: the Semois (flow-dependent). Leg 2: open Flemish water near Ghent.
  const ghent = [
    { lat: 51.05, lng: 3.72 },
    { lat: 51.052, lng: 3.725 },
  ];
  const line = (pts: { lat: number; lng: number }[]) => ({
    status: "routed",
    geometry: pts.map((p) => ({ ...p, elevation: 10 })),
  });
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Mixed day",
      points: [semois[0], semois[semois.length - 1], ghent[1]],
      legs: [
        { mode: "paddle", route: line(semois) },
        { mode: "paddle", route: line(ghent) },
      ],
      startDate: "2026-10-14",
    },
  };
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), JSON.stringify(save));
  await page.goto("/");

  const day = page.getByRole("complementary", { name: strings.daysPanelLabel }).getByRole("listitem").first();
  const dayStatus = day.locator(".day-access-status");
  // The open leg settles at once; the day must still read checking while the flow is held.
  await expect(page.locator(".leg-row").nth(1).locator(".leg-access-status")).toContainText(strings.accessState.open);
  await expect(dayStatus).toHaveText(strings.tripAccess.dayStatus(strings.accessChecking));
  await expect(page.getByRole("region", { name: strings.tripAccess.summaryLabel })).toContainText(strings.accessChecking);

  held.release();
  await expect(dayStatus).toHaveText(strings.tripAccess.dayStatus(strings.accessState["closed-today"]));
});
