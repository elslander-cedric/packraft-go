// #208: official aires on the route sit among your on-route points in the Access points
// tab, in route order and read-only; the ones elsewhere aren't listed. The legs are stored
// routed and the aires are built in, so no live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { serialiseTrip } from "../src/core/saveFile";
import type { LatLng, Trip } from "../src/core/trip";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { enterAccessPointEditing, raiseSheet } from "./support/accessPointEditing";

const text = strings.planner;
const aireText = strings.officialAires;

// Down the Amblève at Coo: a hike leg to the put-in at aire "Plopsa", then a paddle leg
// to the take-out at aire "Au Pont de Cheneux". Aire "Les Faravennes" is about 150 m
// off the hike leg; aire "Au Pont de l'Amblève" at Stavelot is far from the route.
const PLOPSA = 'Aire "Plopsa" à Coo';
const FARAVENNES = 'Aire "Les Faravennes" à Coo';
const CHENEUX = 'Aire "Au Pont de Cheneux"';
const STAVELOT = 'Aire "Au Pont de l\'Amblève" à Stavelot';
const P: LatLng[] = [
  { lat: 50.392, lng: 5.9 },
  { lat: 50.39462, lng: 5.87677 },
  { lat: 50.39772, lng: 5.82264 },
];
const straight = (a: LatLng, b: LatLng) =>
  Array.from({ length: 11 }, (_, i) => ({
    lat: a.lat + ((b.lat - a.lat) * i) / 10,
    lng: a.lng + ((b.lng - a.lng) * i) / 10,
    elevation: 200,
  }));
const TRIP: Trip = {
  name: "Amblève",
  points: P,
  legs: [
    { mode: "hike", route: { status: "routed", geometry: straight(P[0], P[1]) } },
    { mode: "paddle", route: { status: "routed", geometry: straight(P[1], P[2]) } },
  ],
};

const T = "2026-10-12T08:00:00.000Z";
const point = (id: string, name: string, lat: number, lng: number): AccessPoint => ({
  id,
  position: { lat, lng },
  name,
  nameSource: "typed",
  use: "both",
  kind: "slipway",
  note: "",
  checkedOnSite: null,
  createdAt: T,
  updatedAt: T,
});
const POINTS = [point("mid", "Mill bank", 50.3962, 5.85), point("far", "Durbuy jetty", 50.34, 5.46)];

const section = (page: Page) => page.getByRole("region", { name: text.accessPointsLabel, exact: true });
const onRouteRows = (page: Page) =>
  section(page).getByRole("list", { name: text.onRouteHeading, exact: true }).locator(".planner-access-point-item");
const row = (page: Page, name: string) => onRouteRows(page).filter({ hasText: name });

async function seed(page: Page, trip: Trip, accessPoints: readonly AccessPoint[]) {
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) {
        localStorage.setItem(key, value);
      }
    },
    [
      [TRIP_KEY, serialiseTrip(trip)],
      [ACCESS_POINTS_KEY, serialiseAccessPoints(accessPoints)],
    ] as const,
  );
  const network = await serveOffline(page);
  await page.goto("/");
  return network;
}

/** The aire's details, read-only: only Close. */
async function expectReadOnlyDetails(page: Page, name: string, use: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(use);
  await expect(dialog).toContainText(strings.flow.credit);
  await expect(dialog.getByRole("button")).toHaveText([strings.accessDetailClose]);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("on-route aires sit among your points in route order, and off-route ones aren't listed", async ({ page }) => {
    const network = await seed(page, TRIP, POINTS);
    await enterAccessPointEditing(page);

    await expect(onRouteRows(page)).toHaveText([
      new RegExp(`^${FARAVENNES}\\s*km 1\\.5\\s*${aireText.legend["take-out"]}`),
      new RegExp(`^${PLOPSA}\\s*km 1\\.7 · ${text.yourPutIn}\\s*${aireText.legend["put-in"]}`),
      /^Mill bank\s*km 3\.6/,
      new RegExp(`^${CHENEUX}\\s*km 5\\.5 · ${text.yourTakeOut}\\s*${aireText.legend["take-out"]}`),
    ]);
    await expect(section(page)).not.toContainText(STAVELOT);
    // Your point off the route stays in its own list, the only one under that heading.
    await expect(section(page).getByRole("list", { name: text.notOnRouteHeading, exact: true })).toHaveText(
      /Durbuy jetty/,
    );
    expect(network.blocked).toEqual([]);
  });

  test("an aire's row has no edit or delete and opens the read-only details, with the access layer off", async ({
    page,
  }) => {
    await seed(page, TRIP, POINTS);
    await enterAccessPointEditing(page);

    await expect(row(page, PLOPSA).getByRole("button")).toHaveCount(1);
    await row(page, PLOPSA).getByRole("button").click();
    await expectReadOnlyDetails(page, PLOPSA, aireText.legend["put-in"]);

    await expect(row(page, "Mill bank").getByRole("button")).toHaveCount(3);
    await expect(page.locator(".official-aire-marker")).toHaveCount(0);
  });

  test("your own points are stored exactly as before", async ({ page }) => {
    await seed(page, TRIP, POINTS);
    await enterAccessPointEditing(page);
    await row(page, PLOPSA).getByRole("button").click();
    await page.getByRole("button", { name: strings.accessDetailClose }).click();

    const stored = await page.evaluate((key) => localStorage.getItem(key), ACCESS_POINTS_KEY);
    expect(stored).toBe(serialiseAccessPoints(POINTS));
  });

  test("with none of your own points, the on-route aires are still listed", async ({ page }) => {
    await seed(page, TRIP, []);
    await enterAccessPointEditing(page);

    await expect(onRouteRows(page)).toHaveCount(3);
    await expect(section(page)).not.toContainText(text.noAccessPoints);
  });

  test("a route with no aire on it says so, and without a route none is listed", async ({ page }) => {
    const elsewhere: Trip = {
      name: "",
      points: [
        { lat: 50.5, lng: 4.5 },
        { lat: 50.51, lng: 4.5 },
      ],
      legs: [{ mode: "hike" }],
    };
    await seed(page, elsewhere, POINTS);
    await enterAccessPointEditing(page);

    await expect(section(page)).toContainText(text.noneOnRoute);
    await expect(section(page)).not.toContainText("Official aire");
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("a tap on an aire's row opens its read-only details", async ({ page }) => {
    await seed(page, TRIP, POINTS);
    await enterAccessPointEditing(page);
    await raiseSheet(page);

    await row(page, CHENEUX).getByRole("button").tap();
    await expectReadOnlyDetails(page, CHENEUX, aireText.legend["take-out"]);
  });
});
