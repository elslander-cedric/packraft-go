// Autosave, restore, name and new trip (#9). BRouter is answered from recorded responses.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { expectTripName, freeMapBox, menuItem, pickNextMode, renameTrip, tripPanel } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await expect(tripPanel(page)).toBeVisible();
}

/** Opens the app and returns a function that clicks the map `dx`, `dy` pixels from its centre. */
async function openMap(page: Page) {
  await page.goto("/");
  await waitForMap(page);
  const box = (await freeMapBox(page));
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

test("a drawn trip is restored on reload with its snapped routes, and no routing requests", async ({ page }) => {
  const network = await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(0, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  // The map fits the trip when it opens, so the routes are compared as stored, not in pixels.
  const storedLegs = () => page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null")?.trip.legs);
  const legsBefore = await storedLegs();
  const requestsBefore = network.brouter.length;
  expect(requestsBefore).toBe(2);

  await page.reload();
  await waitForMap(page);

  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  expect(await storedLegs()).toEqual(legsBefore);
  // Figures come from the stored routes, including BRouter's own climb.
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(0).getByRole("status")).toHaveCount(0);
  // Undo history is not restored.
  await expect(undoButton(page)).toBeDisabled();

  // Give any stray request time to show up before counting.
  await page.waitForTimeout(500);
  expect(network.brouter).toHaveLength(requestsBefore);
  expect(network.blocked).toEqual([]);
});

test("a paddle leg is restored on reload with its mode, river route and drop, and no routing requests", async ({
  page,
}) => {
  const TRAIL = SNAPPED;
  const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
  const network = await serveOffline(page, {
    brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL),
  });
  const clickMap = await openMap(page);

  await clickMap(-150, 0);
  await clickMap(0, 0);
  await pickNextMode(page, "paddle");
  await clickMap(150, 0);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);
  const requestsBefore = network.brouter.length;
  expect(network.brouter.map((url) => url.searchParams.get("profile"))).toContain("river");

  await page.reload();
  await waitForMap(page);

  await expect(rows(page).nth(1)).toHaveClass(/phone-row-paddle/);
  await expect(rows(page).nth(0)).toHaveClass(/phone-row-hike/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(rows(page).nth(1)).toContainText("5.9 km");
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(mapRegion(page).locator("path.put-in")).toHaveCount(1);
  await expect(mapRegion(page).locator("path.take-out")).toHaveCount(1);

  await page.waitForTimeout(500);
  expect(network.brouter).toHaveLength(requestsBefore);
  expect(network.blocked).toEqual([]);
});

test("every edit is saved: an undone point stays undone after reload", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(0, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveCount(2);
  await undoButton(page).click();
  await expect(legLines(page)).toHaveCount(1);

  await page.reload();
  await waitForMap(page);
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(legLines(page)).toHaveCount(1);
});

test("the trip name is saved and restored", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);

  await expectTripName(page, "");
  await renameTrip(page, "Ourthe weekend");

  await page.reload();
  await waitForMap(page);
  await expectTripName(page, "Ourthe weekend");
});

// Updated in round 2: new trip now asks for confirmation when the trip has points.
test("new trip, once confirmed, clears to an empty trip, which stays empty after reload", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await renameTrip(page, "Old plan");
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");

  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(legLines(page)).toHaveCount(0);
  await expectTripName(page, "");
  await expect(tripPanel(page)).toContainText(strings.legsPanelEmpty);
  await expect(undoButton(page)).toBeDisabled();

  await page.reload();
  await waitForMap(page);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expectTripName(page, "");
});

test("cancelling the new trip question keeps the current trip", async ({ page }) => {
  const network = await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await renameTrip(page, "Keep me");
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.phone.menu.newTrip);
  await answerConfirmation(page, "newTrip", "cancel");

  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expectTripName(page, "Keep me");
  await expect(undoButton(page)).toBeEnabled();

  await page.reload();
  await waitForMap(page);
  await expect(pointMarkers(page)).toHaveCount(2);
  await expectTripName(page, "Keep me");
  expect(network.brouter).toHaveLength(1);
});

test("new trip on a trip without points clears it without asking", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);

  await renameTrip(page, "Only a name");
  await menuItem(page, strings.phone.menu.newTrip);

  await expectTripName(page, "");
  // Updated for Base UI (#31): no in-page confirmation was shown.
  await expect(confirmDialog(page)).toHaveCount(0);
});

test("unreadable stored data opens an empty trip without crashing", async ({ page }) => {
  await serveOffline(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await waitForMap(page);
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) localStorage.setItem(localStorage.key(i)!, "{corrupt");
    localStorage.setItem("packraft-go.trip", "{corrupt");
  });

  await page.reload();
  await waitForMap(page);
  await expect(tripPanel(page)).toContainText(strings.legsPanelEmpty);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expectTripName(page, "");
  expect(errors).toEqual([]);
});
