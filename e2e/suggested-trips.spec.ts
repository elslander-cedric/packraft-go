// Suggested trips (ADR 0039): Find trips asks for your trip wishes, then the top 10 paddle-only
// trips in the visible map area are drawn as numbered lines with a list in the panel or sheet.
// The search runs on the built-in route network: no live service is asked for it (ADR 0019).
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { delayedKiwis, kayakFixture, kiwisFixtures, serveOffline } from "./support/offline";
import { legLines, mapClicker, openPlanner, panelTab, points } from "./support/planner";
import {
  closeSuggestedTrips,
  findTrips,
  findTripsButton,
  suggestionLines,
  suggestionList,
  suggestionNumbers,
  suggestionRows,
  wishesDialog,
} from "./support/suggestedTrips";

const text = strings.planner.suggestedTrips;
/** A summer Saturday: season and hours only, no live readings. */
const SUMMER = "2027-07-10";

test.describe("on a wide screen", () => {
  test.use({
    viewport: { width: 1400, height: 900 },
    timezoneId: "Europe/Brussels",
  });

  test("set wishes, see 10 numbered lines and the list; closing leaves the trip as it was", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    const click = await mapClicker(page);
    await click(-60, 0);
    await click(60, 0);
    await expect(points(page)).toHaveCount(2);

    await findTrips(page, { paddleKm: 10, maxSwitches: 2, date: SUMMER });

    await expect(suggestionRows(page)).toHaveCount(10);
    await expect(suggestionRows(page).first()).toContainText("1");
    await expect(suggestionRows(page).first()).toContainText(
      /(One-way|Loop) · (\d+\.\d km hike · )?\d+(\.\d)? km paddle · 2 switches/,
    );
    // One line per leg: some suggested trips walk to or from the water too.
    expect(await suggestionLines(page).count()).toBeGreaterThanOrEqual(10);
    await expect(suggestionNumbers(page)).toHaveText(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    // The trip stays drawn and can't be changed: a map tap adds no point.
    await expect(points(page)).toHaveCount(2);
    await click(0, 80);
    await expect(points(page)).toHaveCount(2);

    await closeSuggestedTrips(page);
    await expect(suggestionLines(page)).toHaveCount(0);
    await expect(suggestionList(page)).toHaveCount(0);
    await expect(panelTab(page, strings.planner.tabs.sections)).toHaveAttribute("aria-selected", "true");
    await expect(points(page)).toHaveCount(2);
    await expect(legLines(page)).toHaveCount(1);
  });

  test("the wishes are remembered on this device; the date is not", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    await findTrips(page, { paddleKm: 7.5, maxSwitches: 4, date: SUMMER });
    await expect(suggestionRows(page).first()).toBeVisible();
    await closeSuggestedTrips(page);

    await page.reload();
    await findTripsButton(page).click();
    const dialog = wishesDialog(page);
    await expect(dialog.getByLabel(text.paddleKmLabel)).toHaveValue("7.5");
    await expect(dialog.getByLabel(text.maxSwitchesLabel)).toHaveValue("4");
    await expect(dialog.getByLabel(text.dateLabel)).not.toHaveValue(SUMMER);
  });

  test("with no paddle distance wished, the longest trips come first", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    await findTrips(page, { paddleKm: null, date: SUMMER });
    await expect(suggestionRows(page).first()).toBeVisible();
    const kms = await suggestionRows(page).evaluateAll((rows) =>
      rows.map((row) => Number(/([\d.]+) km paddle/.exec(row.textContent ?? "")?.[1])),
    );
    expect(kms.length).toBeGreaterThan(1);
    expect(kms[0]).toBeGreaterThanOrEqual(kms[kms.length - 1]);
    expect(kms[0]).toBeGreaterThan(5);
  });

  test("the nothing-found reason", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    await findTrips(page, { paddleKm: 60, date: SUMMER });
    await expect(suggestionList(page)).toHaveCount(0);
    await expect(page.getByText(text.reasons.paddleDistance("60 km"))).toBeVisible();
    await expect(suggestionLines(page)).toHaveCount(0);
  });

  test("the search asks no live service: the route network is built in", async ({ page }) => {
    const network = await serveOffline(page);
    await openPlanner(page);
    await findTrips(page, { paddleKm: 10, date: SUMMER });
    await expect(suggestionRows(page)).toHaveCount(10);
    expect(network.brouter).toEqual([]);
    expect(network.kiwis).toEqual([]);
    expect(network.kayak).toEqual([]);
    expect(network.nominatim).toEqual([]);
    expect(network.blocked).toEqual([]);
  });

  test("today's search waits for today's official status and flows", async ({ page }) => {
    // Just after the flow recording (src/hydrometry/fixtures/README.md), in Belgian time.
    await page.clock.setFixedTime(new Date("2026-10-14T09:00:00+02:00"));
    const flows = delayedKiwis(kiwisFixtures("timeseries-list.json", "timeseries-values.json"));
    await serveOffline(page, {
      kiwis: flows.kiwis,
      kayak: kayakFixture("layer5-stretches.json"),
    });
    await openPlanner(page);
    await findTrips(page, { paddleKm: 10 });
    await expect(page.getByText(text.waitingForToday)).toBeVisible();
    await expect(suggestionLines(page)).toHaveCount(0);

    flows.release();
    await expect(page.getByText(text.waitingForToday)).toHaveCount(0);
    await expect(suggestionRows(page).first()).toBeVisible();
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    timezoneId: "Europe/Brussels",
  });

  const box = async (page: Page, locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;

  test("the lines and the rows in the sheet are easy to tap", async ({ page }) => {
    await serveOffline(page);
    await openPlanner(page);
    const button = await box(page, findTripsButton(page));
    expect(Math.min(button.width, button.height)).toBeGreaterThanOrEqual(44);

    await findTrips(page, { paddleKm: 10, date: SUMMER });
    // The phone's map shows less of Belgium, so it may find fewer than 10.
    await expect(suggestionRows(page).first()).toBeVisible();
    expect(await suggestionLines(page).count()).toBeGreaterThanOrEqual(await suggestionRows(page).count());
    const row = await box(page, suggestionRows(page).first());
    expect(row.height).toBeGreaterThanOrEqual(44);
    await expect(suggestionRows(page).first()).toBeInViewport();
    const badge = await box(page, suggestionNumbers(page).first());
    expect(Math.min(badge.width, badge.height)).toBeGreaterThanOrEqual(28);
    // The lines are drawn wide enough to see and hit with a finger.
    const width = await suggestionLines(page)
      .first()
      .evaluate((line) => Number(getComputedStyle(line).strokeWidth.replace("px", "")));
    expect(width).toBeGreaterThanOrEqual(5);
  });
});
