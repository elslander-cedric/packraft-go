// #213, ADR 0035: an official aire's details show its stretch's access status, so a planner
// doesn't plan around an aire on a closed river. PKAYAK and KiWIS are intercepted (ADR 0019):
// recorded answers are replayed, with the page's clock set to the recording's morning.
import { expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { toggleAccessLayer } from "./support/mapMenu";
import { kayakFixture, kiwisFixtures, serveOffline } from "./support/offline";
import { holdWater, mapRegion, points, showTab } from "./support/planner";

/** Just after the recording (see src/kayak/fixtures/README.md), in Belgian time. */
const RECORDED_AT = new Date("2026-11-02T10:45:00+01:00");
const RECORDED_DAY = "2026-11-02";
const RECORDED = kayakFixture("layer5-stretches.json");
const KIWIS = kiwisFixtures("timeseries-list.json", "timeseries-values.json");

const DROUGHT = "En raison des étiages sévères, la circulation sur les cours d'eau de type annexe 1C est suspendue";
const OLD_TEXT = "Fermeture de 2021, texte oublié";

/** Aire 0, a take-out on `LESSE2` (1.C), which the recording has closed by ministerial order. */
const CHANLY = "Aire de Chanly";
const CHANLY_WATER = "walloon-1C2a";
const nearChanly: Trip = {
  name: "",
  points: [
    { lat: 50.083, lng: 5.143 },
    { lat: 50.083, lng: 5.163 },
  ],
  legs: [{ mode: "hike" }],
};

/** A trip that starts at the aire, so the Access points tab lists it. */
const fromChanly: Trip = {
  name: "",
  points: [
    { lat: 50.07847, lng: 5.15324 },
    { lat: 50.083, lng: 5.163 },
  ],
  legs: [{ mode: "hike" }],
};

/** Aire 39, a put-in on `AMBLEVE1`, which the recording has open. On this trip's route. */
const PLOPSA = 'Aire "Plopsa" à Coo';
const throughCoo: Trip = {
  name: "",
  points: [
    { lat: 50.39462, lng: 5.87677 },
    { lat: 50.39772, lng: 5.82264 },
  ],
  legs: [{ mode: "hike" }],
};

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

const details = (page: Page, name: string) => page.getByRole("dialog", { name });
const status = (page: Page, name: string) => details(page, name).locator(".access-aire-status");

async function seed(page: Page, trip: Trip) {
  await page.clock.setFixedTime(RECORDED_AT);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
}

async function open(page: Page, trip: Trip) {
  await seed(page, trip);
  await page.goto("/");
  await expect(points(page)).toHaveCount(trip.points.length);
}

async function openChanly(page: Page) {
  await open(page, nearChanly);
  await toggleAccessLayer(page);
  await mapRegion(page).locator(".official-aire-0").click();
}

/** Opens the aire from the Access points tab, with the access layer off. */
async function openPlopsaFromTab(page: Page) {
  await open(page, throughCoo);
  await showTab(page, strings.planner.tabs.accessPoints);
  await page.getByRole("button", { name: new RegExp(`^${PLOPSA}`) }).click();
}

test("an aire on a closed stretch shows the closure and the SPW's reason for today", async ({ page }) => {
  const network = await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await openChanly(page);

  await expect(status(page, CHANLY)).toContainText(strings.accessState["closed-today"]);
  await expect(details(page, CHANLY)).toContainText(strings.accessStatusOn(RECORDED_DAY));
  await expect(details(page, CHANLY)).toContainText(strings.official.closed(DROUGHT));

  // The map and the dialog share one answer, and nothing went anywhere else.
  expect(network.kayak).toHaveLength(1);
  expect(network.blocked).toEqual([]);
});

test("an aire opened with the access layer off still gets the status, and an open stretch's old text stays out", async ({
  page,
}) => {
  const network = await serveOffline(page, {
    kiwis: KIWIS,
    kayak: () => {
      const reply = RECORDED();
      const answer = JSON.parse(reply.body!) as { features: { attributes: Record<string, unknown> }[] };
      const stretch = answer.features.find(({ attributes }) => attributes.nomtro === "AMBLEVE1")!;
      stretch.attributes.justif = OLD_TEXT;
      return { ...reply, body: JSON.stringify(answer) };
    },
  });
  await openPlopsaFromTab(page);

  await expect(status(page, PLOPSA)).toContainText(strings.accessState.open);
  await expect(details(page, PLOPSA)).toContainText(strings.official.open);
  await expect(details(page, PLOPSA)).not.toContainText(OLD_TEXT);
  expect(network.blocked).toEqual([]);
});

test("the status checks first, and claims nothing until the SPW answers", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await serveOffline(page, {
    kiwis: KIWIS,
    kayak: async () => {
      await gate;
      return RECORDED();
    },
  });
  await openChanly(page);

  await expect(status(page, CHANLY)).toHaveText(strings.accessChecking);
  release();
  await expect(status(page, CHANLY)).toContainText(strings.accessState["closed-today"]);
});

test("with the service down the computed status stands, as on the rest of the app", async ({ page }) => {
  const network = await serveOffline(page, { kayak: () => ({ status: 503, body: "" }), kiwis: KIWIS });
  await openChanly(page);

  await expect(status(page, CHANLY)).not.toContainText(strings.accessChecking);
  await expect(details(page, CHANLY)).not.toContainText(strings.official.closed(DROUGHT));
  await expect(details(page, CHANLY)).toContainText(strings.official.notChecked.closures);
  const { title, url } = strings.official.notCheckedLink;
  await expect(details(page, CHANLY).getByRole("link", { name: title })).toHaveAttribute("href", url);
  const aireStatus = await status(page, CHANLY).textContent();
  await details(page, CHANLY).getByRole("button", { name: strings.accessDetailClose }).click();

  // The aire's stretch reads just as the same water does on the map.
  await holdWater(page, CHANLY_WATER);
  await expect(page.getByRole("dialog").locator(".access-status")).toHaveText(aireStatus!);
  expect(network.kayak).toHaveLength(1);
});

test("on a later date the status is for that date, and rule-based", async ({ page }) => {
  await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await open(page, nearChanly);
  await toggleAccessLayer(page);
  await page.getByRole("button", { name: /^Access · / }).click();
  await page.getByLabel(strings.accessDateLabel).fill("2026-11-20");
  await page.getByRole("button", { name: strings.planner.accessDialogClose }).click();
  await mapRegion(page).locator(".official-aire-0").click();

  await expect(status(page, CHANLY)).toContainText(strings.accessState.open);
  await expect(details(page, CHANLY)).toContainText(strings.accessStatusOn("2026-11-20"));
  await expect(status(page, CHANLY)).not.toContainText(strings.accessState["closed-today"]);
  // Today's closure may still apply then: a note, through the same reason path (#212).
  await expect(details(page, CHANLY)).toContainText(DROUGHT);
});

test("an aire opened with the layer off on a later date still notes today's closure", async ({ page }) => {
  await serveOffline(page, { kayak: RECORDED, kiwis: KIWIS });
  await open(page, fromChanly);
  await toggleAccessLayer(page);
  await page.getByRole("button", { name: /^Access · / }).click();
  await page.getByLabel(strings.accessDateLabel).fill("2026-11-20");
  await page.getByRole("button", { name: strings.planner.accessDialogClose }).click();
  await toggleAccessLayer(page);

  await showTab(page, strings.planner.tabs.accessPoints);
  await page.getByRole("button", { name: new RegExp(`^${CHANLY}`) }).click();

  await expect(status(page, CHANLY)).toContainText(strings.accessState.open);
  await expect(details(page, CHANLY)).toContainText(DROUGHT);
});
