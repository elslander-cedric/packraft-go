// Autosave, restore, name and new trip (#9). BRouter is answered from recorded responses.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

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

test("new trip clears to an empty trip, which stays empty after reload", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await tripName(page).fill("Old plan");
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  await page.getByRole("button", { name: strings.newTripButton }).click();

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
