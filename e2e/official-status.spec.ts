// #210, ADR 0035: the SPW's official status for today. PKAYAK and KiWIS are intercepted
// (ADR 0019): recorded answers are replayed, and the page's clock is set to the recording's
// morning. No test calls the live service.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { kayakFixture, kiwisFixtures, serveOffline } from "./support/offline";
import { toggleAccessLayer } from "./support/mapMenu";
import { accessWater, holdWater, openPlanner, openSectionDetails } from "./support/planner";

/** Just after the recording (see src/kayak/fixtures/README.md), in Belgian time. */
const RECORDED_AT = new Date("2026-11-02T10:45:00+01:00");
const RECORDED = kayakFixture("layer5-stretches.json");
const KIWIS = kiwisFixtures("timeseries-list.json", "timeseries-values.json");
const ON_RECORDED_DAY = "Mon 2 Nov 2026";

/** The Salm below Vielsalm (1.C): no minimum flow, closed in the drought by ministerial order. */
const SALM = "walloon-1C1b";
const DROUGHT = "En raison des étiages sévères, la circulation sur les cours d'eau de type annexe 1C est suspendue";
/** The Amblève from Sougné to the Ourthe (1.A): closed by the SPW with its own reason. */
const AMBLEVE_FLOODED = "walloon-1A1";
/** The Semois from Chassepierre (1.B), on `SEMOIS2-3`: closed with no reason given. */
const SEMOIS = "walloon-1B4c";
/** The Amblève from the Warche (1.B), on `AMBLEVE1`: open. */
const AMBLEVE_OPEN = "walloon-1B1a";
/** The Amblève, lower down (1.B): the SPW lists no official stretch here. */
const AMBLEVE_UNLISTED = "walloon-1B1b";

const salm = [
  { lat: 50.28756, lng: 5.9139 },
  { lat: 50.28777, lng: 5.91393 },
];

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

const detail = (page: Page) => page.getByRole("dialog");

async function seedSalmToday(page: Page) {
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Salm today",
      points: salm,
      legs: [
        { mode: "paddle", route: { status: "routed", geometry: salm.map((point) => ({ ...point, elevation: 300 })) } },
      ],
      startDate: "2026-11-02",
    },
  };
  await page.addInitScript((text) => localStorage.setItem("packraft-go.trip", text), JSON.stringify(save));
}

test("the map shows the SPW's status today, with its reason on a closed stretch", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await openPlanner(page);
  await toggleAccessLayer(page);

  await expect(accessWater(page, SALM)).toHaveClass(/access-closed-today/);
  await holdWater(page, SALM);
  await expect(detail(page)).toContainText(strings.official.closed(DROUGHT));
  await detail(page).getByRole("button", { name: strings.accessDetailClose }).click();

  await holdWater(page, AMBLEVE_FLOODED);
  await expect(detail(page)).toContainText(strings.official.closed("Rivière non sécurisée suite aux inondations"));
  await detail(page).getByRole("button", { name: strings.accessDetailClose }).click();

  // SEMOIS2-3 gives no reason. Flow figures stay beside the official status.
  await expect(accessWater(page, SEMOIS)).toHaveClass(/access-closed-today/);
  await holdWater(page, SEMOIS);
  await expect(detail(page)).toContainText(strings.official.closed(strings.official.tooLow));
  await expect(detail(page)).toContainText(strings.flow.heading);
  await detail(page).getByRole("button", { name: strings.accessDetailClose }).click();

  await expect(accessWater(page, AMBLEVE_OPEN)).toHaveClass(/access-open/);
  await holdWater(page, AMBLEVE_OPEN);
  await expect(detail(page)).toContainText(strings.official.open);
  await detail(page).getByRole("button", { name: strings.accessDetailClose }).click();

  await holdWater(page, AMBLEVE_UNLISTED);
  await expect(detail(page)).toContainText(strings.official.none);

  // One request, whatever is shown, and nothing went anywhere else.
  expect(network.kayak).toHaveLength(1);
  expect(network.kayak[0].searchParams.get("returnGeometry")).toBe("false");
  expect(network.blocked).toEqual([]);
});

test("a paddle leg on a closed stretch checks first, then gets the closure warning with the reason, and never blocks", async ({
  page,
}) => {
  await page.clock.setFixedTime(RECORDED_AT);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const network = await serveOffline(page, {
    kayak: async () => {
      await gate;
      return RECORDED();
    },
    kiwis: KIWIS,
  });
  await seedSalmToday(page);
  await openPlanner(page);

  const leg = await openSectionDetails(page, 1);
  const status = leg.locator(".leg-access-status");
  await expect(status).toHaveText(strings.tripAccess.legStatusOn(ON_RECORDED_DAY, strings.accessChecking));
  await expect.poll(() => network.kayak.length).toBeGreaterThan(0);

  release();
  await expect(status).toHaveText(strings.tripAccess.legStatusOn(ON_RECORDED_DAY, strings.accessState["closed-today"]));
  await expect(leg.locator(".access-warning-closed")).toContainText(strings.official.closed(DROUGHT));
  expect(network.blocked).toEqual([]);
});

test("the computed status stands when the service fails", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: () => ({ status: 503, body: "" }) });
  await seedSalmToday(page);
  await openPlanner(page);

  const leg = await openSectionDetails(page, 1);
  await expect(leg.locator(".leg-access-status")).not.toContainText(strings.accessChecking);
  await expect(leg.locator(".leg-access-status")).not.toContainText(strings.accessState["closed-today"]);
  expect(network.kayak).toHaveLength(1);
  expect(network.blocked).toEqual([]);
});
