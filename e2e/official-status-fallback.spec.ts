// #211, ADR 0035: with no official reading, the computed status stands and a note says how far
// to trust it. PKAYAK and KiWIS are intercepted (ADR 0019): each is replayed from its recording
// or fails, and the page's clock is set to the recording's morning. No test calls a live service.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { toggleAccessLayer } from "./support/mapMenu";
import { kayakFixture, kiwisFixtures, serveOffline } from "./support/offline";
import { accessWater, holdWater, legDetailsDialog, openPlanner, openSectionDetails } from "./support/planner";

/** Just after each recording (see the fixtures' READMEs), in Belgian time. */
const KAYAK_RECORDED_AT = new Date("2026-11-02T10:45:00+01:00");
const KIWIS_RECORDED_AT = new Date("2026-10-14T09:00:00+02:00");
const KAYAK = kayakFixture("layer5-stretches.json");
const KIWIS = kiwisFixtures("timeseries-list.json", "timeseries-values.json");
const FAILING = () => ({ status: 503, body: "" });

const ON_KAYAK_DAY = "Mon 2 Nov 2026";
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

async function seedSalmToday(page: Page) {
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Salm today",
      points: salm,
      legs: [{ mode: "paddle", route: { status: "routed", geometry: salm.map((p) => ({ ...p, elevation: 300 })) } }],
      startDate: "2026-11-02",
    },
  };
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), JSON.stringify(save));
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

test.describe("at phone size", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

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
});
