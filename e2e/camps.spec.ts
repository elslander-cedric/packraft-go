// Camps and per-day totals (#8). BRouter is answered from recorded responses:
// the hiking profile gets the recorded trail (3.2 km, 100 m climb, 49 min),
// the river profile the recorded Lesse track (5.9 km, about 1 h 11 min at 5 km/h).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  dayCards,
  freeMapBox,
  legRows as legCards,
  menuItem,
  openPlanner,
  openTripFile,
  pickNextMode,
  saveTripFile,
  showTab,
} from "./support/planner";

// The trip panel shows one tab at a time (ADR 0034): each list shows its tab first.
const legRows = async (page: Page) => {
  await showTab(page, strings.planner.tabs.legs);
  return legCards(page);
};
const dayRows = async (page: Page) => {
  await showTab(page, strings.planner.tabs.days);
  return dayCards(page);
};
const dayLabels = strings.planner.dayFigures;
const dayTime = (day: Locator) => day.locator(".day-figure-time");
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const campMarkers = (page: Page) => mapRegion(page).locator(".camp-marker");
const campButton = (page: Page) => page.getByRole("button", { name: strings.campButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

/** Minutes in a shown time such as "1 h 13 min" or "49 min". */
function minutes(text: string): number {
  const m = text.match(/(?:(\d+) h )?(\d+) min/);
  if (!m) throw new Error(`no time in "${text}"`);
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

/** Draws a hike leg then a paddle leg, both routed; returns the middle point's position on screen. */
async function drawHikeThenPaddle(page: Page) {
  await openPlanner(page);
  const box = (await freeMapBox(page));
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(middle.x - 150, middle.y);
  await page.mouse.click(middle.x, middle.y);
  await pickNextMode(page, "paddle");
  await page.mouse.click(middle.x + 150, middle.y);
  await expect((await legRows(page)).nth(1)).toContainText(strings.dropLabel);
  await expect((await legRows(page)).nth(0)).toContainText(strings.climbLabel);
  return middle;
}

async function campAtMiddle(page: Page, middle: { x: number; y: number }) {
  await page.mouse.click(middle.x, middle.y); // select the middle point
  await expect(campButton(page)).toBeEnabled();
  await campButton(page).click();
}

test("a trip without camps is one day with the trip's totals", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  const days = await dayRows(page);
  await expect(days).toHaveCount(1);
  await expect(days.nth(0).locator(".day-tile")).toHaveAccessibleName(strings.dayLabel(1));
  await expect(days.nth(0)).toContainText(`${dayLabels.hike} 3.2 km`);
  await expect(days.nth(0)).toContainText(`${dayLabels.paddle} 5.9 km`);
  // The camp button is only shown while a point is selected.
  await expect(campButton(page)).toHaveCount(0);
});

test("a camp splits the trip into two days with correct per-day totals, and undo removes it", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  const routedSoFar = network.brouter.length;
  const legs = await legRows(page);
  const legDescent = (await legs.nth(0).textContent())!.match(/Descent (\d+) m/)![1];
  const paddleMin = minutes((await legs.nth(1).locator(".planner-row-time").textContent()) ?? "");

  await campAtMiddle(page, middle);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "true");
  const days = await dayRows(page);
  await expect(days).toHaveCount(2);

  // Day 1: the hike leg only. (A day card leaves out a figure that is zero.)
  const day1 = days.nth(0);
  await expect(day1.locator(".day-tile")).toHaveAccessibleName(strings.dayLabel(1));
  await expect(day1).toContainText(`${dayLabels.hike} 3.2 km`);
  await expect(day1).not.toContainText(dayLabels.paddle);
  await expect(day1).toContainText(`${dayLabels.climb} 100 m`);
  await expect(day1).toContainText(`${dayLabels.descent} ${legDescent} m`);
  await expect(dayTime(day1)).toHaveText(`${dayLabels.time} 49 min`);

  // Day 2: the paddle leg only; paddle legs add no climb or descent.
  const day2 = days.nth(1);
  await expect(day2.locator(".day-tile")).toHaveAccessibleName(strings.dayLabel(2));
  await expect(day2).not.toContainText(dayLabels.hike);
  await expect(day2).toContainText(`${dayLabels.paddle} 5.9 km`);
  await expect(day2).not.toContainText(dayLabels.climb);
  expect(minutes((await dayTime(day2).textContent()) ?? "")).toBe(paddleMin);

  // Marking a camp changes no leg, so nothing is snapped again.
  expect(network.brouter.length).toBe(routedSoFar);
  await expect((await legRows(page)).nth(0)).toContainText(strings.climbLabel);

  // Undo takes the camp away and the trip is one day again, still routed.
  await undoButton(page).click();
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(await dayRows(page)).toHaveCount(1);
  await expect((await legRows(page)).nth(0)).toContainText(strings.climbLabel);
  expect(network.brouter.length).toBe(routedSoFar);
});

test("unmarking a camp joins the days again", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  await campAtMiddle(page, middle);
  await expect(await dayRows(page)).toHaveCount(2);

  await campButton(page).click(); // the point is still selected
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(await dayRows(page)).toHaveCount(1);
});

test("camps are kept across a reload", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  await campAtMiddle(page, middle);
  await expect(await dayRows(page)).toHaveCount(2);
  const routedBefore = network.brouter.length;

  await page.reload();
  await expect(points(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(1);
  const days = await dayRows(page);
  await expect(days).toHaveCount(2);
  await expect(dayTime(days.nth(0))).toHaveText(`${dayLabels.time} 49 min`);
  expect(network.brouter.length).toBe(routedBefore);
});

test("camps are kept through save to file and open file", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  await campAtMiddle(page, middle);
  await expect(await dayRows(page)).toHaveCount(2);

  const download = await saveTripFile(page);
  const saved = await download.path();
  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await menuItem(page, strings.planner.menu.newTrip);
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(points(page)).toHaveCount(0);
  await expect(campMarkers(page)).toHaveCount(0);

  await openTripFile(page, saved);
  await expect(points(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(1);
  const days = await dayRows(page);
  await expect(days).toHaveCount(2);
  await expect(days.nth(1)).toContainText(`${dayLabels.paddle} 5.9 km`);
});

test("a day waits for its legs to be snapped before showing its time", async ({ page }) => {
  let answer: (reply: BRouterReply) => void = () => {};
  const held = new Promise<BRouterReply>((resolve) => (answer = resolve));
  await serveOffline(page, { brouter: () => held });
  await openPlanner(page);
  const box = (await freeMapBox(page));
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);

  const days = await dayRows(page);
  await expect(dayTime(days.nth(0))).toHaveText(`${dayLabels.time} ${strings.timePending}`);
  answer(TRAIL);
  await expect(dayTime(days.nth(0))).toHaveText(`${dayLabels.time} 49 min`);
});
