// #212, ADR 0035: on a future date the status stays rule-based, and a stretch the SPW has
// closed today says so, as an order "until further notice" may still apply. PKAYAK and KiWIS
// are intercepted (ADR 0019) and the page's clock is set to the recording's morning.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { kayakFixture, kiwisFixtures, serveOffline } from "./support/offline";
import { toggleAccessLayer } from "./support/mapMenu";
import { accessWater, holdWater, openPlanner, openSectionDetails } from "./support/planner";

/** Just after the recording (see src/kayak/fixtures/README.md), in Belgian time. */
const RECORDED_AT = new Date("2026-11-02T10:45:00+01:00");
/** Half past midnight in Belgium: still 2 November in UTC. */
const JUST_AFTER_MIDNIGHT = new Date("2026-11-03T00:30:00+01:00");
const RECORDED = kayakFixture("layer5-stretches.json");
const KIWIS = kiwisFixtures("timeseries-list.json", "timeseries-values.json");

/** The Salm below Vielsalm (1.C): in season, but closed today by ministerial order. */
const SALM = "walloon-1C1b";
const DROUGHT = "En raison des étiages sévères, la circulation sur les cours d'eau de type annexe 1C est suspendue";
const NOTE = strings.official.closedTodayNote(DROUGHT);
/** The Amblève from the Warche (1.B), on `AMBLEVE1`: open today. */
const AMBLEVE_OPEN = "walloon-1B1a";

const salm = [
  { lat: 50.28756, lng: 5.9139 },
  { lat: 50.28777, lng: 5.91393 },
];

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

const detail = (page: Page) => page.getByRole("dialog");

async function seedSalmOn(page: Page, startDate: string) {
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Salm",
      points: salm,
      legs: [
        { mode: "paddle", route: { status: "routed", geometry: salm.map((point) => ({ ...point, elevation: 300 })) } },
      ],
      startDate,
    },
  };
  await page.addInitScript((text) => localStorage.setItem("packraft-go.trip", text), JSON.stringify(save));
}

/** Sets the access layer's date in the access chip's dialog (ADR 0034). */
async function setLayerDate(page: Page, date: string) {
  await page.getByRole("button", { name: /^Access · / }).click();
  const dialog = page.getByRole("dialog", { name: strings.planner.accessDialogTitle });
  await dialog.getByLabel(strings.accessDateLabel, { exact: true }).fill(date);
  await dialog.getByRole("button", { name: strings.planner.accessDialogClose }).click();
  await expect(dialog).toHaveCount(0);
}

test("the map's details on a future date keep the rule-based status and note a closure today", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await openPlanner(page);
  await toggleAccessLayer(page);
  await setLayerDate(page, "2026-11-03");

  await expect(accessWater(page, SALM)).toHaveClass(/access-open/);
  await holdWater(page, SALM);
  await expect(detail(page)).toContainText(NOTE);
  await expect(detail(page)).toContainText(strings.accessStatusOn("2026-11-03"));
  await detail(page).getByRole("button", { name: strings.accessDetailClose }).click();

  // A stretch open today has no such note.
  await holdWater(page, AMBLEVE_OPEN);
  await expect(detail(page)).toContainText(strings.accessStatusOn("2026-11-03"));
  await expect(detail(page)).not.toContainText(strings.official.closedTodayNote(""));

  expect(network.kayak).toHaveLength(1);
  expect(network.blocked).toEqual([]);
});

test("a paddle leg on a future date notes the closure today, without reading closed", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await seedSalmOn(page, "2026-11-03");
  await openPlanner(page);

  const leg = await openSectionDetails(page, 1);
  await expect(leg.locator(".access-warning-check-flow")).toContainText(NOTE);
  await expect(leg.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Tue 3 Nov 2026", strings.accessState.open),
  );
  await expect(leg.locator(".access-warning-closed")).toHaveCount(0);
  expect(network.blocked).toEqual([]);
});

test("a past date doesn't ask for the official status", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await seedSalmOn(page, "2026-11-01");
  await openPlanner(page);

  const leg = await openSectionDetails(page, 1);
  await expect(leg.locator(".leg-access-status")).toContainText("Sun 1 Nov 2026");
  expect(network.kayak).toHaveLength(0);
});

test("with the service down a future date has the rules and no note", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: () => ({ status: 503, body: "" }), kiwis: KIWIS });
  await seedSalmOn(page, "2026-11-03");
  await openPlanner(page);

  const leg = await openSectionDetails(page, 1);
  await expect.poll(() => network.kayak.length).toBeGreaterThan(0);
  await expect(leg.locator(".leg-access-status")).toHaveText(
    strings.tripAccess.legStatusOn("Tue 3 Nov 2026", strings.accessState.open),
  );
  await expect(leg).not.toContainText(strings.official.closedTodayNote(""));
  expect(network.blocked).toEqual([]);
});

test.describe("just after midnight in Brussels, while it is still yesterday in UTC", () => {
  test("a leg dated tomorrow keeps its day and gets the note", async ({ page }) => {
    await page.clock.setFixedTime(JUST_AFTER_MIDNIGHT);
    await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
    await seedSalmOn(page, "2026-11-04");
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).toHaveText(
      strings.tripAccess.legStatusOn("Wed 4 Nov 2026", strings.accessState.open),
    );
    await expect(leg.locator(".access-warning-check-flow")).toContainText(NOTE);
  });

  test("a leg dated this new day is today: the closure is the status, not a note", async ({ page }) => {
    await page.clock.setFixedTime(JUST_AFTER_MIDNIGHT);
    await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
    await seedSalmOn(page, "2026-11-03");
    await openPlanner(page);

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).toHaveText(
      strings.tripAccess.legStatusOn("Tue 3 Nov 2026", strings.accessState["closed-today"]),
    );
    await expect(leg.locator(".access-warning-closed")).toContainText(strings.official.closed(DROUGHT));
    await expect(leg).not.toContainText(NOTE);
  });

  test("a date picked on the map stays the date picked", async ({ page }) => {
    await page.clock.setFixedTime(JUST_AFTER_MIDNIGHT);
    await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
    await openPlanner(page);
    await toggleAccessLayer(page);
    await setLayerDate(page, "2026-11-04");

    await expect(accessWater(page, SALM)).toHaveClass(/access-open/);
    await holdWater(page, SALM);
    await expect(detail(page)).toContainText(strings.accessStatusOn("2026-11-04"));
    await expect(detail(page)).toContainText(NOTE);
  });
});
