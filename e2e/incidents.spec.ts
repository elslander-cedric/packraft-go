// #216, ADR 0035: the SPW's current incidents draw with the access layer at any zoom, and a tap
// reads one. When they can't be loaded the "not checked" note names them. PKAYAK is intercepted
// (ADR 0019): layer 0 is replayed from its recording or fails, and the page's clock is set to
// the recording's day. No test calls a live service.
import { expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { toggleAccessLayer } from "./support/mapMenu";
import { kayakFixture, serveOffline, type OfflineOptions } from "./support/offline";
import { accessWater, holdWater, mapRegion, openPlanner, openSectionDetails } from "./support/planner";

const RECORDED_AT = new Date("2026-11-02T14:00:00+01:00");
const KAYAK = kayakFixture("layer5-stretches.json");
const INCIDENTS = kayakFixture("layer0-incidents.json");
const FAILING = () => ({ status: 503, body: "" });

const { closures: CLOSURES_NOTE, incidents: INCIDENTS_NOTE } = strings.official.notChecked;
const { url: SPW, title: LINK } = strings.official.notCheckedLink;

/** The recording's "River closed" on the Ourthe at La Roche, id 2003. */
const CLOSED_RIVER = { spwId: 2003, lat: 50.18092, lng: 5.57605 };

/** An answer of one incident, with the fields the recording leaves as they are unless overridden. */
const oneIncident = (attributes: object) => () => ({
  status: 200,
  body: JSON.stringify({
    features: [
      {
        attributes: { id: 9, nomtro: "OURTHE2", commen: "Travaux au pont", datcre: Date.UTC(2026, 9, 1, 8), ...attributes },
        geometry: { x: CLOSED_RIVER.lng, y: CLOSED_RIVER.lat },
      },
    ],
  }),
});

const markers = (page: Page) => mapRegion(page).locator(".incident-marker");
const marker = (page: Page, spwId: number) => mapRegion(page).locator(`.incident-${spwId}`);
const dialog = (page: Page) => page.getByRole("dialog", { name: strings.incidents.title });

/** Zooms the map to the recorded closure: at the opening zoom the two at La Roche overlap. */
async function seedAroundClosedRiver(page: Page) {
  const { lat, lng } = CLOSED_RIVER;
  const trip = {
    name: "",
    points: [
      { lat: lat + 0.004, lng: lng - 0.01 },
      { lat: lat + 0.004, lng: lng + 0.01 },
    ],
    legs: [{ mode: "hike" as const }],
  };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
}

async function openWith(page: Page, options: OfflineOptions) {
  await page.clock.setFixedTime(RECORDED_AT);
  const network = await serveOffline(page, { kayak: KAYAK, ...options });
  await openPlanner(page);
  return network;
}

/** A paddle leg on the Salm below Vielsalm, an official stretch, on a date. */
async function seedSalm(page: Page, startDate: string) {
  const salm = [
    { lat: 50.28756, lng: 5.9139 },
    { lat: 50.28777, lng: 5.91393 },
  ];
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

test.use({ timezoneId: "Europe/Brussels" });

test.describe("at desktop size", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("they draw with the access layer at the opening zoom, and go with it", async ({ page }) => {
    const network = await openWith(page, { incidents: INCIDENTS });
    await expect(markers(page)).toHaveCount(0);
    expect(network.incidents).toEqual([]);

    await toggleAccessLayer(page);
    await expect(markers(page)).toHaveCount(3);
    expect(network.incidents).toHaveLength(1);
    expect(network.kayak).toHaveLength(1);

    await toggleAccessLayer(page);
    await expect(markers(page)).toHaveCount(0);
    expect(network.blocked).toEqual([]);
  });

  test("a tap reads the SPW's English text and the date it was reported", async ({ page }) => {
    await seedAroundClosedRiver(page);
    await openWith(page, { incidents: INCIDENTS });
    await toggleAccessLayer(page);

    await marker(page, CLOSED_RIVER.spwId).click();
    await expect(dialog(page)).toContainText("River closed (works in progress)");
    await expect(dialog(page)).toContainText(strings.incidents.reported("Mon 2 Mar 2026"));
    await expect(dialog(page)).toContainText(strings.flow.credit);
  });

  test("with no English text it reads the French", async ({ page }) => {
    await openWith(page, { incidents: oneIncident({ commene: null }) });
    await toggleAccessLayer(page);

    await marker(page, 9).click();
    await expect(dialog(page)).toContainText("Travaux au pont");
  });

  test("an incident past its expiry isn't shown", async ({ page }) => {
    await openWith(page, { incidents: oneIncident({ datexp: Date.UTC(2026, 10, 1, 12) }) });
    await toggleAccessLayer(page);
    await expect(mapRegion(page).locator(".official-aire-marker").first()).toBeAttached();
    await expect(markers(page)).toHaveCount(0);
  });

  test("an incident that ends today is still shown", async ({ page }) => {
    await openWith(page, { incidents: oneIncident({ datexp: Date.UTC(2026, 10, 2, 12) }) });
    await toggleAccessLayer(page);
    await expect(markers(page)).toHaveCount(1);
  });

  test("an old incident with no expiry is shown with its date", async ({ page }) => {
    await openWith(page, { incidents: INCIDENTS });
    await toggleAccessLayer(page);

    await marker(page, 1).click();
    await expect(dialog(page)).toContainText(strings.incidents.reported("Mon 30 Apr 2018"));
  });

  test("when they fail, a water's details name them, and the status still comes from the SPW", async ({ page }) => {
    const network = await openWith(page, { incidents: FAILING });
    await toggleAccessLayer(page);
    await expect(markers(page)).toHaveCount(0);

    await expect(accessWater(page, "walloon-1B4c")).toBeAttached();
    await holdWater(page, "walloon-1B4c");
    const note = page.getByRole("dialog").locator(".access-not-checked");
    await expect(note).toContainText(INCIDENTS_NOTE);
    await expect(note).not.toContainText(CLOSURES_NOTE);
    await expect(note.getByRole("link", { name: LINK })).toHaveAttribute("href", SPW);
    expect(network.kayak).toHaveLength(1);
    expect(network.blocked).toEqual([]);
  });

  test("with the status down too, the same note names both", async ({ page }) => {
    await seedSalm(page, "2026-11-02");
    await openWith(page, { kayak: FAILING, incidents: FAILING });

    const note = (await openSectionDetails(page, 1)).locator(".access-not-checked");
    await expect(note).toContainText(CLOSURES_NOTE);
    await expect(note).toContainText(INCIDENTS_NOTE);
    await expect(page.locator(".access-not-checked")).toHaveCount(1);
  });

  test("with the incidents and the status loaded, a leg has no note", async ({ page }) => {
    await seedSalm(page, "2026-11-02");
    await openWith(page, { incidents: INCIDENTS });

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).not.toContainText(strings.accessChecking);
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
  });

  test("a leg on a future date names them too", async ({ page }) => {
    await seedSalm(page, "2026-11-20");
    await openWith(page, { incidents: FAILING });

    const note = (await openSectionDetails(page, 1)).locator(".access-not-checked");
    await expect(note).toContainText(INCIDENTS_NOTE);
    await expect(note).not.toContainText(CLOSURES_NOTE);
  });

  test("a leg on a past date asks for no incidents and has no note", async ({ page }) => {
    await seedSalm(page, "2026-10-20");
    const network = await openWith(page, { incidents: FAILING });

    const leg = await openSectionDetails(page, 1);
    await expect(leg.locator(".leg-access-status")).toBeVisible();
    await expect(leg.locator(".access-not-checked")).toHaveCount(0);
    expect(network.incidents).toEqual([]);
  });
});

test.describe("at phone size", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a tap reads an incident in a dialog that fits the screen", async ({ page }) => {
    await page.clock.setFixedTime(RECORDED_AT);
    const network = await serveOffline(page, { kayak: KAYAK, incidents: INCIDENTS });
    await seedAroundClosedRiver(page);
    await page.goto("/");
    await toggleAccessLayer(page);

    await marker(page, CLOSED_RIVER.spwId).tap();
    await expect(dialog(page)).toContainText("River closed (works in progress)");
    await expect(dialog(page).getByText(strings.incidents.reported("Mon 2 Mar 2026"))).toBeInViewport({ ratio: 1 });
    expect(network.blocked).toEqual([]);
  });
});
