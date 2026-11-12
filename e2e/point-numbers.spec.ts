// Route points show their number on the map (prototype/point-numbers, verdict C): every point
// from `pointNumbersMinZoom` (unit-tested) on, further out only the first, the last and the selected one. The
// number is the one the point card shows. Tiles come from the fixture (ADR 0019).
import { expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { mapRegion, openPlanner, points } from "./support/planner";

const numbers = (page: Page) => mapRegion(page).locator(".point-number");
/** The numbers shown, in order (a newly numbered point's label is added last). */
const shownNumbers = (page: Page) =>
  expect.poll(async () => (await numbers(page).allTextContents()).map(Number).sort((left, right) => left - right));

async function seedTrip(page: Page) {
  const trip = {
    name: "",
    points: [
      // About 2 km apart: numbered when the map fits them, still apart once zoomed out.
      { lat: 50.25, lng: 5.43 },
      { lat: 50.265, lng: 5.445 },
      { lat: 50.28, lng: 5.46 },
      { lat: 50.295, lng: 5.475 },
    ],
    legs: [{ mode: "hike" as const }, { mode: "paddle" as const }, { mode: "hike" as const }],
  };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(trip)]);
}

/** Zooms out with the map's own keyboard, a level at a time, until only the ends are numbered. */
async function zoomOutUntilEndsOnly(page: Page) {
  await page.locator(".leaflet-container").focus();
  for (let level = 0; level < 12 && (await numbers(page).count()) > 2; level++) {
    await page.keyboard.press("-");
    await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  }
}

test("every point shows its number close in, only the ends and the selected one further out", async ({ page }) => {
  await seedTrip(page);
  const network = await serveOffline(page);
  await openPlanner(page);
  await expect(points(page)).toHaveCount(4);
  await shownNumbers(page).toEqual([1, 2, 3, 4]);

  await zoomOutUntilEndsOnly(page);
  await shownNumbers(page).toEqual([1, 4]);

  // The selected point is numbered, as its card says.
  const box = (await points(page).nth(1).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(points(page).nth(1)).toHaveClass(/point-selected/);
  await expect(page.getByRole("group", { name: /^Point 2 · / })).toContainText(
    strings.planner.selectedPointShortName(2),
  );
  await shownNumbers(page).toEqual([1, 2, 4]);

  expect(network.blocked).toEqual([]);
});
