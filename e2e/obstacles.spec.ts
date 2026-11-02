// #214, ADR 0035: the SPW's obstacles draw with the access layer once zoomed in, from the
// built-in snapshot, and a tap reads one in a read-only dialog. No live service is called.
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { accessLayerItem, mapMenuButton, toggleAccessLayer } from "./support/mapMenu";
import { serveOffline } from "./support/offline";
import { mapRegion, points } from "./support/planner";

const text = strings.obstacles;

// One obstacle of each kind, far from any other marker, in the data as of the 2026-11-02 snapshot.
const SAMPLES = [
  { kind: "dam", spwId: 85, lng: 5.11601, lat: 50.15888, lastChanged: "2023-01-23", says: /check it.*portage/i },
  { kind: "impassable", spwId: 149, lng: 5.69328, lat: 50.12747, lastChanged: "2023-01-30", says: /portage required/i },
  { kind: "rocks", spwId: 68, lng: 5.78176, lat: 49.87391, lastChanged: "2023-01-23", says: /take care/i },
  { kind: "drossage", spwId: 127, lng: 6.13221, lat: 50.15541, lastChanged: "2023-01-23", says: /take care.*sharply.*bank/i },
  { kind: "low-bridge", spwId: 152, lng: 5.89924, lat: 50.37774, lastChanged: "2023-01-30", says: /take care.*portage.*high water/i },
] as const;
const [DAM] = SAMPLES;

/** A trip either side of a place, `span` degrees of longitude wide, which sets the zoom. */
const around = ({ lat, lng }: { lat: number; lng: number }, span = 0.02): Trip => ({
  name: "",
  points: [
    { lat: lat + 0.004, lng: lng - span / 2 },
    { lat: lat + 0.004, lng: lng + span / 2 },
  ],
  legs: [{ mode: "hike" }],
});

const obstacles = (page: Page) => mapRegion(page).locator(".obstacle-marker");
const marker = (page: Page, spwId: number) => mapRegion(page).locator(`.obstacle-${spwId}`);

async function openWith(page: Page, trip: Trip) {
  const network = await serveOffline(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
  await page.goto("/");
  await expect(points(page)).toHaveCount(trip.points.length);
  return network;
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("obstacles draw and go with the access layer, only once zoomed in", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    await toggleAccessLayer(page);
    await expect(mapRegion(page).locator(".official-aire-marker").first()).toBeAttached();
    await expect(obstacles(page)).toHaveCount(0);
  });

  test("zoomed in, all the obstacles show with the layer on, and none with it off", async ({ page }) => {
    const network = await openWith(page, around(DAM));
    await expect(obstacles(page)).toHaveCount(0);

    await toggleAccessLayer(page);
    await expect(obstacles(page)).toHaveCount(96);
    await expect(page.locator(".leaflet-control-attribution")).toContainText(strings.flow.credit);

    await toggleAccessLayer(page);
    await expect(obstacles(page)).toHaveCount(0);
    expect(network.blocked).toEqual([]);
  });

  test("each kind has its own icon, also in the legend", async ({ page }) => {
    await openWith(page, around(DAM));
    await toggleAccessLayer(page);
    await expect(obstacles(page)).toHaveCount(96);

    const seen = await Promise.all(
      SAMPLES.map(({ spwId }) => marker(page, spwId).locator("svg[data-icon]").getAttribute("data-icon")),
    );
    expect(new Set(seen).size).toBe(SAMPLES.length);

    await page.getByRole("button", { name: /^Access · / }).click();
    const legend = page.getByRole("region", { name: strings.accessLegendLabel });
    const shown = await Promise.all(
      SAMPLES.map(async ({ kind }) => {
        const line = legend.getByText(text.names[kind], { exact: true });
        await expect(line).toBeVisible();
        return line.locator("svg[data-icon]").getAttribute("data-icon");
      }),
    );
    expect(shown).toEqual(seen);
  });

  for (const sample of SAMPLES) {
    test(`a click on a ${sample.kind} says what it means, and changes nothing`, async ({ page }) => {
      const network = await openWith(page, around(sample));
      await toggleAccessLayer(page);

      await marker(page, sample.spwId).click();
      const dialog = page.getByRole("dialog", { name: text.names[sample.kind] });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(sample.says);
      await expect(dialog).toContainText(strings.officialAires.lastChanged(sample.lastChanged));
      await expect(dialog).toContainText(strings.officialAires.snapshot("2026-11-02"));
      await expect(dialog.getByRole("link", { name: /SPW/ })).toHaveAttribute("href", /PKAYAK\/MapServer\/1$/);
      await expect(dialog).toContainText(strings.flow.credit);
      // Read-only: nothing to edit, only Close.
      await expect(dialog.getByRole("button")).toHaveText([strings.accessDetailClose]);
      await expect(dialog.getByRole("textbox")).toHaveCount(0);
      await dialog.getByRole("button", { name: strings.accessDetailClose }).click();
      await expect(dialog).toHaveCount(0);

      await expect(points(page)).toHaveCount(2);
      expect(network.blocked).toEqual([]);
    });
  }

  test("a map not zoomed in much shows small obstacles that leave clicks to the river beneath", async ({ page }) => {
    await openWith(page, around(DAM, 0.5));
    await toggleAccessLayer(page);
    await expect(obstacles(page)).toHaveCount(96);

    const box = (await marker(page, DAM.spwId).boundingBox())!;
    expect(box.width).toBeLessThan(20);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(points(page)).toHaveCount(3);
    await expect(page.getByRole("dialog", { name: text.names.dam })).toHaveCount(0);
  });

  test("obstacles show with the network off, after one visit", async ({ page, context }) => {
    await openWith(page, around(DAM));
    await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null);
    await toggleAccessLayer(page);
    await expect(obstacles(page)).toHaveCount(96);
    await toggleAccessLayer(page);
    await page.reload();
    await expect(points(page)).toHaveCount(2);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await expect(points(page)).toHaveCount(2);
    await toggleAccessLayer(page);
    await expect(obstacles(page)).toHaveCount(96);
    await marker(page, DAM.spwId).click();
    await expect(page.getByRole("dialog", { name: text.names.dam })).toBeVisible();
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("an obstacle has a finger-sized target, and a tap opens its details", async ({ page }) => {
    const network = await openWith(page, around(DAM));
    await mapMenuButton(page).click();
    await accessLayerItem(page).click();
    await expect(marker(page, DAM.spwId)).toBeInViewport();

    const box = (await marker(page, DAM.spwId).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await marker(page, DAM.spwId).tap();
    const dialog = page.getByRole("dialog", { name: text.names.dam });
    await expect(dialog).toContainText(strings.obstacles.meanings.dam);
    await dialog.getByRole("button", { name: strings.accessDetailClose }).click();
    await expect(points(page)).toHaveCount(2);
    expect(network.blocked).toEqual([]);
  });
});
