// #62: snapping a new put-in to one of your access points (accept, undo and
// decline), and the Walloon aire warning on the leg, the day and the trip summary.
import { expect, test, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint } from "../src/core/accessPoints";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { freeMapCentre, legDetailsDialog, legLines, openPlanner, pickNextMode, saveTripFile, showTab } from "./support/planner";

test.use({ viewport: { width: 1400, height: 900 } });

// Durbuy is in Wallonia. 0.001 degrees of latitude is about 111 m.
const putIn = { lat: 50.3527, lng: 5.4563 };
const nearby = { lat: 50.3537, lng: 5.4563 };


async function seed(page: Page, kind: "slipway" | "official-aire") {
  const trip = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    // Only the start: the planner draws the paddle leg from it, which makes it a new put-in.
    trip: { name: "Ourthe", points: [putIn], legs: [] },
  });
  const now = "2026-10-14T08:00:00.000Z";
  const added = addAccessPoint([], { id: "ap1", at: nearby, now });
  const points = serialiseAccessPoints(updateAccessPoint(added, "ap1", { kind, use: "put-in" }, now));
  await page.addInitScript(
    ([tripSave, pointsSave]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("packraft-go.trip", tripSave);
      localStorage.setItem("packraft-go.access-points", pointsSave);
    },
    [trip, points],
  );
}

/**
 * Draws a paddle leg from the trip's start with the next leg's mode toggle (ADR 0034): the start
 * becomes a new put-in, about 111 m from your access point.
 */
async function drawPaddleLeg(page: Page) {
  await openPlanner(page);
  await pickNextMode(page, "paddle");
  const centre = await freeMapCentre(page);
  // The map opens fitted to the one point, as close as it goes: zoom out a few levels, so the
  // take-out is far enough (several hundred metres) from the aire.
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 180);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await page.waitForTimeout(300);
  await page.mouse.click(centre.x + 300, centre.y - 250);
  await expect(legLines(page)).toHaveCount(1);
}
const legDetails = legDetailsDialog;
const offer = (page: Page) => page.getByRole("region", { name: strings.snap.label });
const storedFirstPoint = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null")?.trip?.points?.[0]);

test("a new put-in near your access point offers a snap; accepting moves it and undo brings it back", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await drawPaddleLeg(page);
  await expect(offer(page)).toBeVisible();
  await expect(offer(page)).toContainText("put-in");
  await offer(page).getByRole("button", { name: strings.snap.accept }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedFirstPoint(page)).toEqual(nearby);

  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect.poll(() => storedFirstPoint(page)).toEqual(putIn);
});

test("declining the snap offer changes nothing", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await drawPaddleLeg(page);
  await offer(page).getByRole("button", { name: strings.snap.decline }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedFirstPoint(page)).toEqual(putIn);
});

test("a Walloon put-in without an official aire nearby shows the warning on the leg and a chip on its day", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await drawPaddleLeg(page);

  // The leg's details dialog (#158) holds the warning.
  const legs = page.getByRole("list", { name: strings.legsPanelLabel });
  await legs.getByRole("button", { name: strings.planner.legDetailsButton(1) }).click();
  await expect(legDetails(page).locator(".access-warning-aire").first()).toContainText(strings.aire.warningKind);
  await legDetails(page).getByRole("button", { name: strings.planner.legDetailsClose }).click();
  // The day only points at the leg (ADR 0029); the paddle leg is also forbidden here or not, but it has a chip.
  await showTab(page, strings.planner.tabs.days);
  const days = page.getByRole("complementary", { name: strings.daysPanelLabel });
  await expect(days.locator(".day-warning-chip")).toHaveCount(1);
  await expect(days.locator(".access-warning-aire")).toHaveCount(0);

  // It never blocks: the trip can still be saved.
  const save = await saveTripFile(page);
  expect(save.suggestedFilename()).toMatch(/\.packraft\.json$/);
});

test("an official aire of yours within 200 m of the put-in removes that warning", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "official-aire");
  await drawPaddleLeg(page);

  const legs = page.getByRole("list", { name: strings.legsPanelLabel });
  await legs.getByRole("button", { name: strings.planner.legDetailsButton(1) }).click();
  // The take-out at the leg's end is still not at an aire; the put-in is.
  await expect(legDetails(page).locator(".access-warning-aire")).toHaveCount(1);
  await expect(legDetails(page).locator(".access-warning-aire")).toContainText("take-out");
});
