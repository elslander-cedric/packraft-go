// Time estimates and settings (#7). BRouter is answered from recorded
// responses: the hiking profile gets the recorded trail (3.2 km, 100 m climb),
// the river profile the recorded Lesse track.
import { expect, test, type Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const settingsPanel = (page: Page) => page.getByRole("region", { name: strings.settingsPanelLabel });
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const legTime = (page: Page, leg: number) => rows(page).nth(leg).locator(".leg-time");
const tripTime = (page: Page) => legsPanel(page).locator(".trip-time");
const paceFactor = (page: Page) => settingsPanel(page).getByLabel(strings.paceFactorLabel);
const paddleSpeed = (page: Page) => settingsPanel(page).getByLabel(strings.paddleSpeedLabel);

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

/** Minutes in a shown time such as "1 h 13 min" or "49 min". */
function minutes(text: string): number {
  const m = text.match(/(?:(\d+) h )?(\d+) min/);
  if (!m) throw new Error(`no time in "${text}"`);
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** A hike leg then a paddle leg, both routed from the recordings. */
async function drawHikeThenPaddle(page: Page) {
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await rows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(rows(page).nth(1)).toContainText(strings.dropLabel);
  // Updated in round 2: the trip total waits for every leg to be routed.
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
}

test("each leg and the trip show an estimated time, labelled as an estimate", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);

  // Naismith on the recorded trail: 3.2 km ÷ 5 km/h + 100 m ÷ 600 m/h ≈ 49 min.
  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} 49 min`);
  // The Lesse track (5.9 km) at the default 5 km/h: about 1 h 11 min.
  await expect(legTime(page, 1)).toContainText(strings.legTimeEstimate);
  const paddleMin = minutes((await legTime(page, 1).textContent()) ?? "");
  expect(paddleMin).toBeGreaterThanOrEqual(70);
  expect(paddleMin).toBeLessThanOrEqual(72);

  await expect(tripTime(page)).toContainText(strings.tripTotalTimeEstimate);
  // The total is summed before rounding, so it may differ from the shown legs by a minute.
  const totalMin = minutes((await tripTime(page).textContent()) ?? "");
  expect(Math.abs(totalMin - (49 + paddleMin))).toBeLessThanOrEqual(1);
  await expect(legsPanel(page)).toContainText(strings.timeEstimateNote);
});

test("changing the pace factor and paddling speed updates the times at once", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  await expect(paceFactor(page)).toHaveValue("1");
  await expect(paddleSpeed(page)).toHaveValue("5");
  const paddleBefore = minutes((await legTime(page, 1).textContent()) ?? "");

  await paceFactor(page).fill("1.5");
  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} 1 h 13 min`);
  // The paddle leg does not depend on the pace factor.
  expect(minutes((await legTime(page, 1).textContent()) ?? "")).toBe(paddleBefore);

  await paddleSpeed(page).fill("2.5");
  await expect
    .poll(async () => minutes((await legTime(page, 1).textContent()) ?? ""))
    .toBeGreaterThanOrEqual(2 * paddleBefore - 1);
  expect(minutes((await legTime(page, 1).textContent()) ?? "")).toBeLessThanOrEqual(2 * paddleBefore + 1);
  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} 1 h 13 min`);

  // While a field is cleared or not a positive number, the times keep the last usable value.
  await paceFactor(page).fill("");
  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} 1 h 13 min`);
  await paceFactor(page).fill("0");
  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} 1 h 13 min`);
});

test("while a hike leg is being snapped its time and the trip total show an ellipsis", async ({ page }) => {
  let answer: (reply: BRouterReply) => void = () => {};
  const held = new Promise<BRouterReply>((resolve) => (answer = resolve));
  await serveOffline(page, { brouter: () => held });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);

  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} ${strings.timePending}`);
  await expect(tripTime(page)).toHaveText(`${strings.tripTotalTimeEstimate} ${strings.timePending}`);

  answer(TRAIL);
  await expect(legTime(page, 0)).toHaveText(`${strings.legTimeEstimate} 49 min`);
  await expect(tripTime(page)).toHaveText(`${strings.tripTotalTimeEstimate} 49 min`);
});

test("a hike leg that failed to snap shows a distance-only time marked as having no climb data, and so does the total", async ({
  page,
}) => {
  await serveOffline(page); // BRouter unavailable
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(rows(page).nth(0).getByRole("alert")).toBeVisible();

  const noClimb = new RegExp(`\\d+ min \\(no climb data\\)$`);
  await expect(legTime(page, 0)).toHaveText(noClimb);
  await expect(tripTime(page)).toHaveText(noClimb);
  expect(strings.timeWithoutClimb("45 min")).toBe("45 min (no climb data)");
});

test("settings are remembered across reloads", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);
  await paceFactor(page).fill("1.2");
  await paddleSpeed(page).fill("4");

  await page.reload();
  await expect(paceFactor(page)).toHaveValue("1.2");
  await expect(paddleSpeed(page)).toHaveValue("4");
});

test("unreadable stored settings fall back to the defaults", async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript((key) => window.localStorage.setItem(key, "{not json"), SETTINGS_KEY);
  await openMap(page);
  await expect(paceFactor(page)).toHaveValue("1");
  await expect(paddleSpeed(page)).toHaveValue("5");
});
