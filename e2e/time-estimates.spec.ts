// Time estimates and settings (#7). BRouter is answered from recorded
// responses: the hiking profile gets the recorded trail (3.2 km, 100 m climb),
// the river profile the recorded Lesse track.
import { expect, test, type Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  changeSettings,
  legRows as rows,
  mapClicker,
  menuItem,
  openPlanner,
  settingsDialog,
  totals,
} from "./support/planner";

const legTime = (page: Page, leg: number) => rows(page).nth(leg).locator(".phone-row-time");
const tripTime = (page: Page) =>
  totals(page).locator(".phone-total").filter({ hasText: strings.phone.totals.labels.time });
const paceFactor = (page: Page) => settingsDialog(page).getByLabel(strings.paceFactorLabel);
const paddleSpeed = (page: Page) => settingsDialog(page).getByLabel(strings.paddleSpeedLabel);
const legTimeLabel = strings.phone.legFigures.time;
const tripTimeLabel = strings.phone.totals.labels.time;
/** Menu → Settings, left open. */
const openSettings = (page: Page) => menuItem(page, strings.phone.menu.settings);

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
  await openPlanner(page);
  return mapClicker(page);
}

/** A hike leg then a paddle leg, both routed from the recordings. */
async function drawHikeThenPaddle(page: Page) {
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0, "paddle");
  await expect(rows(page).nth(1)).toContainText(strings.dropLabel);
  // Updated in round 2: the trip total waits for every leg to be routed.
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
}

test("each leg and the trip show an estimated time, labelled as an estimate", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);

  // Naismith on the recorded trail: 3.2 km ÷ 5 km/h + 100 m ÷ 600 m/h ≈ 49 min.
  await expect(legTime(page, 0)).toHaveText(`${legTimeLabel} 49 min`);
  // The Lesse track (5.9 km) at the default 5 km/h: about 1 h 11 min.
  await expect(legTime(page, 1)).toContainText(legTimeLabel);
  const paddleMin = minutes((await legTime(page, 1).textContent()) ?? "");
  expect(paddleMin).toBeGreaterThanOrEqual(70);
  expect(paddleMin).toBeLessThanOrEqual(72);

  await expect(tripTime(page)).toContainText(tripTimeLabel);
  // The total is summed before rounding, so it may differ from the shown legs by a minute.
  const totalMin = minutes((await tripTime(page).textContent()) ?? "");
  expect(Math.abs(totalMin - (49 + paddleMin))).toBeLessThanOrEqual(1);
});

test("changing the pace factor and paddling speed updates the times at once", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  await openSettings(page);
  await expect(paceFactor(page)).toHaveValue("1");
  await expect(paddleSpeed(page)).toHaveValue("5");
  await page.keyboard.press("Escape");
  await expect(settingsDialog(page)).toHaveCount(0);
  const paddleBefore = minutes((await legTime(page, 1).textContent()) ?? "");

  await changeSettings(page, { paceFactor: "1.5" });
  await expect(legTime(page, 0)).toHaveText(`${legTimeLabel} 1 h 13 min`);
  // The paddle leg does not depend on the pace factor.
  expect(minutes((await legTime(page, 1).textContent()) ?? "")).toBe(paddleBefore);

  await changeSettings(page, { paddleSpeed: "2.5" });
  await expect
    .poll(async () => minutes((await legTime(page, 1).textContent()) ?? ""))
    .toBeGreaterThanOrEqual(2 * paddleBefore - 1);
  expect(minutes((await legTime(page, 1).textContent()) ?? "")).toBeLessThanOrEqual(2 * paddleBefore + 1);
  await expect(legTime(page, 0)).toHaveText(`${legTimeLabel} 1 h 13 min`);

  // While a field is cleared or not a positive number, the settings can't be saved and the
  // times keep the last usable value.
  await openSettings(page);
  const save = settingsDialog(page).getByRole("button", { name: strings.phone.menu.settingsConfirm });
  await paceFactor(page).fill("");
  await expect(save).toBeDisabled();
  await paceFactor(page).fill("0");
  await expect(save).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(legTime(page, 0)).toHaveText(`${legTimeLabel} 1 h 13 min`);
});

test("while a hike leg is being snapped its time and the trip total show an ellipsis", async ({ page }) => {
  let answer: (reply: BRouterReply) => void = () => {};
  const held = new Promise<BRouterReply>((resolve) => (answer = resolve));
  await serveOffline(page, { brouter: () => held });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);

  await expect(legTime(page, 0)).toHaveText(`${legTimeLabel} ${strings.timePending}`);
  await expect(tripTime(page)).toHaveText(`${tripTimeLabel} ${strings.timePending}`);

  answer(TRAIL);
  await expect(legTime(page, 0)).toHaveText(`${legTimeLabel} 49 min`);
  await expect(tripTime(page)).toHaveText(`${tripTimeLabel} 49 min`);
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
  await changeSettings(page, { paceFactor: "1.2", paddleSpeed: "4" });

  await page.reload();
  await openSettings(page);
  await expect(paceFactor(page)).toHaveValue("1.2");
  await expect(paddleSpeed(page)).toHaveValue("4");
});

test("unreadable stored settings fall back to the defaults", async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript((key) => window.localStorage.setItem(key, "{not json"), SETTINGS_KEY);
  await openMap(page);
  await openSettings(page);
  await expect(paceFactor(page)).toHaveValue("1");
  await expect(paddleSpeed(page)).toHaveValue("5");
});
