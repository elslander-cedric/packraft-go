// Camps and per-day totals (#8). BRouter is answered from recorded responses:
// the hiking profile gets the recorded trail (3.2 km, 100 m climb, 49 min),
// the river profile the recorded Lesse track (5.9 km, about 1 h 11 min at 5 km/h).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const daysPanel = (page: Page) => page.getByRole("complementary", { name: strings.daysPanelLabel });
const dayRows = (page: Page) => daysPanel(page).getByRole("listitem");
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
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const dx of [-150, 0, 150]) await page.mouse.click(middle.x + dx, middle.y);
  await legRows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
  await expect(legRows(page).nth(0)).toContainText(strings.climbLabel);
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
  await expect(dayRows(page)).toHaveCount(1);
  await expect(dayRows(page).nth(0)).toContainText(strings.dayLabel(1));
  await expect(dayRows(page).nth(0)).toContainText(`${strings.dayHikeDistance} 3.2 km`);
  await expect(dayRows(page).nth(0)).toContainText(`${strings.dayPaddleDistance} 5.9 km`);
  await expect(campButton(page)).toBeDisabled(); // no point selected
});

test("a camp splits the trip into two days with correct per-day totals, and undo removes it", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  const routedSoFar = network.brouter.length;

  await campAtMiddle(page, middle);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(dayRows(page)).toHaveCount(2);

  // Day 1: the hike leg only.
  const day1 = dayRows(page).nth(0);
  await expect(day1).toContainText(strings.dayLabel(1));
  await expect(day1).toContainText(`${strings.dayHikeDistance} 3.2 km`);
  await expect(day1).toContainText(`${strings.dayPaddleDistance} 0.0 km`);
  await expect(day1).toContainText(`${strings.climbLabel} 100 m`);
  const legDescent = (await legRows(page).nth(0).textContent())!.match(/Descent (\d+) m/)![1];
  await expect(day1).toContainText(`${strings.descentLabel} ${legDescent} m`);
  await expect(day1.locator(".day-time")).toHaveText(`${strings.dayTimeEstimate} 49 min`);

  // Day 2: the paddle leg only; paddle legs add no climb or descent.
  const day2 = dayRows(page).nth(1);
  await expect(day2).toContainText(strings.dayLabel(2));
  await expect(day2).toContainText(`${strings.dayHikeDistance} 0.0 km`);
  await expect(day2).toContainText(`${strings.dayPaddleDistance} 5.9 km`);
  await expect(day2).toContainText(`${strings.climbLabel} 0 m`);
  const paddleMin = minutes((await legRows(page).nth(1).locator(".leg-time").textContent()) ?? "");
  expect(minutes((await day2.locator(".day-time").textContent()) ?? "")).toBe(paddleMin);

  // Marking a camp changes no leg, so nothing is snapped again.
  expect(network.brouter.length).toBe(routedSoFar);
  await expect(legRows(page).nth(0)).toContainText(strings.climbLabel);

  // Undo takes the camp away and the trip is one day again, still routed.
  await undoButton(page).click();
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(dayRows(page)).toHaveCount(1);
  await expect(legRows(page).nth(0)).toContainText(strings.climbLabel);
  expect(network.brouter.length).toBe(routedSoFar);
});

test("unmarking a camp joins the days again", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  await campAtMiddle(page, middle);
  await expect(dayRows(page)).toHaveCount(2);

  await campButton(page).click(); // the point is still selected
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(dayRows(page)).toHaveCount(1);
});

test("camps are kept across a reload", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  await campAtMiddle(page, middle);
  await expect(dayRows(page)).toHaveCount(2);
  const routedBefore = network.brouter.length;

  await page.reload();
  await expect(points(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(dayRows(page)).toHaveCount(2);
  await expect(dayRows(page).nth(0).locator(".day-time")).toHaveText(`${strings.dayTimeEstimate} 49 min`);
  expect(network.brouter.length).toBe(routedBefore);
});

test("camps are kept through save to file and open file", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  const middle = await drawHikeThenPaddle(page);
  await campAtMiddle(page, middle);
  await expect(dayRows(page)).toHaveCount(2);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.saveFileButton }).click(),
  ]);
  const saved = await download.path();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: strings.newTripButton }).click();
  await expect(points(page)).toHaveCount(0);
  await expect(campMarkers(page)).toHaveCount(0);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: strings.openFileButton }).click(),
  ]);
  await chooser.setFiles(saved);
  await expect(points(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(dayRows(page)).toHaveCount(2);
  await expect(dayRows(page).nth(1)).toContainText(`${strings.dayPaddleDistance} 5.9 km`);
});

test("a day waits for its legs to be snapped before showing its time", async ({ page }) => {
  let answer: (reply: BRouterReply) => void = () => {};
  const held = new Promise<BRouterReply>((resolve) => (answer = resolve));
  await serveOffline(page, { brouter: () => held });
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);

  await expect(dayRows(page).nth(0).locator(".day-time")).toHaveText(
    `${strings.dayTimeEstimate} ${strings.timePending}`,
  );
  answer(TRAIL);
  await expect(dayRows(page).nth(0).locator(".day-time")).toHaveText(`${strings.dayTimeEstimate} 49 min`);
});
