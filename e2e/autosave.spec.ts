// Autosave, restore, name and new trip (#9). BRouter is answered from recorded responses.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const newTripButton = (page: Page) => page.getByRole("button", { name: strings.newTripButton });

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

/** Opens the app and returns a function that clicks the map `dx`, `dy` pixels from its centre. */
async function openMap(page: Page) {
  await page.goto("/");
  await waitForMap(page);
  const box = (await mapRegion(page).boundingBox())!;
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
  const pathsBefore = await legLines(page).evaluateAll((paths) => paths.map((p) => p.getAttribute("d")));
  const requestsBefore = network.brouter.length;
  expect(requestsBefore).toBe(2);

  await page.reload();
  await waitForMap(page);

  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  expect(await legLines(page).evaluateAll((paths) => paths.map((p) => p.getAttribute("d")))).toEqual(pathsBefore);
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
  const modeButton = (leg: number, mode: string) =>
    rows(page)
      .nth(leg)
      .getByRole("group", { name: strings.legModeLabel(leg + 1) })
      .getByRole("button", { name: mode });

  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await expect(legLines(page)).toHaveCount(2);
  await modeButton(1, strings.legModePaddle).click();
  await expect(legLines(page).nth(1)).toHaveClass(/leg-paddle/);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);
  await expect(rows(page).nth(1)).toContainText(`${strings.dropLabel} 7 m`);
  const requestsBefore = network.brouter.length;
  expect(network.brouter.map((url) => url.searchParams.get("profile"))).toContain("river");

  await page.reload();
  await waitForMap(page);

  await expect(modeButton(1, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton(0, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
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

  await expect(tripName(page)).toHaveValue("");
  await tripName(page).fill("Ourthe weekend");

  await page.reload();
  await waitForMap(page);
  await expect(tripName(page)).toHaveValue("Ourthe weekend");
});

// Updated in round 2: new trip now asks for confirmation when the trip has points.
test("new trip, once confirmed, clears to an empty trip, which stays empty after reload", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await tripName(page).fill("Old plan");
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await newTripButton(page).click();
  await answerConfirmation(page, "newTrip", "confirm");

  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(legLines(page)).toHaveCount(0);
  await expect(tripName(page)).toHaveValue("");
  await expect(legsPanel(page)).toContainText(strings.legsPanelEmpty);
  await expect(undoButton(page)).toBeDisabled();

  await page.reload();
  await waitForMap(page);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(tripName(page)).toHaveValue("");
});

test("cancelling the new trip question keeps the current trip", async ({ page }) => {
  const network = await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await tripName(page).fill("Keep me");
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await newTripButton(page).click();
  await answerConfirmation(page, "newTrip", "cancel");

  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(tripName(page)).toHaveValue("Keep me");
  await expect(undoButton(page)).toBeEnabled();

  await page.reload();
  await waitForMap(page);
  await expect(pointMarkers(page)).toHaveCount(2);
  await expect(tripName(page)).toHaveValue("Keep me");
  expect(network.brouter).toHaveLength(1);
});

test("new trip on a trip without points clears it without asking", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);

  await tripName(page).fill("Only a name");
  await newTripButton(page).click();

  await expect(tripName(page)).toHaveValue("");
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
  await expect(legsPanel(page)).toContainText(strings.legsPanelEmpty);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(tripName(page)).toHaveValue("");
  expect(errors).toEqual([]);
});
