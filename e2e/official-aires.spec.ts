// #206, ADR 0035: the SPW's official aires draw with the access layer, from the built-in
// snapshot, and a tap reads one in a read-only dialog. No live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { accessLayerItem, mapMenuButton, toggleAccessLayer } from "./support/mapMenu";
import { serveOffline } from "./support/offline";
import { mapRegion, points, tripPanel } from "./support/planner";

const text = strings.officialAires;

// Aire 0, a take-out on the Lesse at Chanly, in the data as of the 2026-11-02 snapshot.
const CHANLY = { selector: ".official-aire-0", name: "Aire de Chanly" };
const nearChanly: Trip = {
  name: "",
  points: [
    { lat: 50.083, lng: 5.143 },
    { lat: 50.083, lng: 5.163 },
  ],
  legs: [{ mode: "hike" }],
};

const aires = (page: Page) => mapRegion(page).locator(".official-aire-marker");
const chanly = (page: Page) => mapRegion(page).locator(CHANLY.selector);
const details = (page: Page) => page.getByRole("dialog", { name: CHANLY.name });

async function openWith(page: Page, trip: Trip) {
  const network = await serveOffline(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  await page.goto("/");
  await expect(points(page)).toHaveCount(trip.points.length);
  return network;
}

async function expectChanlyDetails(page: Page) {
  const dialog = details(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(text.legend["take-out"]);
  await expect(dialog).toContainText("La Lesse, en aval du pont des Barbouillons à Daverdisse, jusqu'à Chanly");
  await expect(dialog).toContainText(strings.spwData.lastChanged("2016-05-02"));
  await expect(dialog).toContainText(strings.flow.credit);
  // Read-only: nothing to edit, only Close.
  await expect(dialog.getByRole("button")).toHaveText([strings.accessDetailClose]);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: strings.accessDetailClose }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("aires draw and go with the access layer, credited to the SPW", async ({ page }) => {
    const network = await serveOffline(page);
    await page.goto("/");
    await expect(mapRegion(page).locator(".leaflet-container")).toBeVisible();
    await expect(aires(page)).toHaveCount(0);

    await toggleAccessLayer(page);
    await expect(aires(page)).toHaveCount(92);
    const attribution = page.locator(".leaflet-control-attribution");
    await expect(attribution).toContainText(strings.flow.credit);
    // The credit's end isn't hidden under the side panel, which floats over the map.
    const credit = (await attribution.boundingBox())!;
    const panel = (await tripPanel(page).boundingBox())!;
    expect(credit.x + credit.width).toBeLessThanOrEqual(panel.x);

    await toggleAccessLayer(page);
    await expect(aires(page)).toHaveCount(0);
    await expect(attribution).not.toContainText(strings.flow.credit);
    expect(network.blocked).toEqual([]);
  });

  test("put-in, take-out and both-ways aires each have their own colour and arrow, also in the legend", async ({
    page,
  }) => {
    await openWith(page, nearChanly);
    await toggleAccessLayer(page);

    const looks = await Promise.all(
      ["put-in", "take-out", "both"].map(async (use) => {
        const marker = mapRegion(page).locator(`.official-aire-marker.use-${use}`).first();
        await expect(marker).toBeAttached();
        return {
          fill: await marker.locator("path").first().getAttribute("fill"),
          arrow: await marker.locator("svg[data-icon]").getAttribute("data-icon"),
        };
      }),
    );
    expect(new Set(looks.map((look) => look.fill)).size).toBe(3);
    expect(new Set(looks.map((look) => look.arrow)).size).toBe(3);

    await page.getByRole("button", { name: /^Access · / }).click();
    const legend = page.getByRole("region", { name: strings.accessLegendLabel });
    for (const use of ["put-in", "take-out", "both"] as const) {
      await expect(legend).toContainText(text.legend[use]);
    }
  });

  test("a click on an aire opens its details and adds nothing to the trip", async ({ page }) => {
    const network = await openWith(page, nearChanly);
    await toggleAccessLayer(page);

    await chanly(page).click();
    await expectChanlyDetails(page);

    await expect(points(page)).toHaveCount(2);
    expect(network.blocked).toEqual([]);
  });

  test("aires never reach the stored trip, access points or settings", async ({ page }) => {
    await openWith(page, nearChanly);
    await toggleAccessLayer(page);
    await chanly(page).click();
    await expect(details(page)).toBeVisible();

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain(CHANLY.name);
  });

  test("a far-out map shows small aires that leave clicks to the river beneath", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    await toggleAccessLayer(page);
    await expect(aires(page)).toHaveCount(92);

    const box = (await chanly(page).boundingBox())!;
    expect(box.width).toBeLessThan(20);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(points(page)).toHaveCount(1);
    await expect(details(page)).toHaveCount(0);
  });

  test("aires show with the network off, after one visit", async ({ page, context }) => {
    await serveOffline(page);
    await page.goto("/");
    await expect(mapRegion(page)).toBeVisible();
    await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null);
    await toggleAccessLayer(page);
    await expect(aires(page)).toHaveCount(92);
    await toggleAccessLayer(page);
    await page.reload();
    await expect(mapRegion(page)).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await expect(mapRegion(page)).toBeVisible();
    await toggleAccessLayer(page);
    await expect(aires(page)).toHaveCount(92);
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("an aire has a finger-sized target, and a tap opens its details", async ({ page }) => {
    const network = await openWith(page, nearChanly);
    await mapMenuButton(page).click();
    await accessLayerItem(page).click();
    await expect(chanly(page)).toBeInViewport();

    const box = (await chanly(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await chanly(page).tap();
    await expectChanlyDetails(page);
    await expect(points(page)).toHaveCount(2);
    expect(network.blocked).toEqual([]);
  });
});
