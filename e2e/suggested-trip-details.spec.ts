// A suggested trip's details and Use this trip (ADR 0039): selecting a suggestion (its row or
// its line) highlights it and shows its details, Back returns to the list, and Use this trip
// makes it the trip, routed for real with recorded BRouter answers (ADR 0019).
import { devices, expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation } from "./support/confirmDialog";
import { brouterFixture, serveOffline } from "./support/offline";
import {
  legLines,
  mapClicker,
  openPlanner,
  panelTab,
  pointOnPath,
  points,
  shownStartDate,
} from "./support/planner";
import {
  fadedSuggestionLines,
  findTrips,
  findTripsButton,
  selectedSuggestionLines,
  suggestionDetails,
  suggestionHitLine,
  suggestionLines,
  suggestionList,
  suggestionRowButton,
  suggestionRows,
} from "./support/suggestedTrips";

const text = strings.planner.suggestedTrips;
/** A summer Saturday: season and hours only, no live readings. */
const SUMMER = "2027-07-10";
const river = () => ({
  status: 200,
  body: brouterFixture("river-success.geojson"),
});

const useButton = (page: Page) => page.getByRole("button", { name: text.use });
const backButton = (page: Page) =>
  page.getByRole("button", { name: text.back });

test.describe("on a wide screen", () => {
  test.use({
    viewport: { width: 1400, height: 900 },
    timezoneId: "Europe/Brussels",
  });

  test("select one, see its details, go back, use one, see it routed", async ({
    page,
  }) => {
    const network = await serveOffline(page, { brouter: river });
    await openPlanner(page);
    const click = await mapClicker(page);
    await click(-60, 0);
    await click(60, 0);
    await expect(points(page)).toHaveCount(2);
    await findTrips(page, { paddleKm: 10, maxSwitches: 2, date: SUMMER });
    await expect(suggestionRows(page)).toHaveCount(10);

    // A row selects its suggestion: the others fade, its details replace the list.
    const rowText = (await suggestionRows(page).nth(1).textContent()) ?? "";
    await suggestionRowButton(page, 2).click();
    const details = suggestionDetails(page, 2);
    await expect(details).toBeVisible();
    await expect(suggestionList(page)).toHaveCount(0);
    await expect(selectedSuggestionLines(page)).toHaveCount(1);
    await expect(fadedSuggestionLines(page)).toHaveCount(9);
    const paddle =
      /\d+\.\d km paddle/.exec(rowText)?.[0] ?? "no paddle distance in the row";
    await expect(details).toContainText(paddle);
    await expect(details).toContainText(text.switches(2));
    await expect(details).toContainText(text.timeLabel);
    await expect(details).toContainText(text.riversLabel);
    await expect(details).toContainText(text.airesLabel);
    // The access of its water on the wished date, as on a hand-drawn leg.
    await expect(details.locator(".leg-access-status")).toContainText(
      "Sat 10 Jul 2027",
    );

    await backButton(page).click();
    await expect(suggestionRows(page)).toHaveCount(10);
    await expect(selectedSuggestionLines(page)).toHaveCount(0);
    await expect(fadedSuggestionLines(page)).toHaveCount(0);

    // A tap on a line on the map selects it too.
    const tapped = await tapSomeSuggestionLine(page);
    await expect(suggestionDetails(page, tapped)).toBeVisible();
    await expect(selectedSuggestionLines(page)).toHaveCount(1);

    // The trip open is replaced only after the usual question.
    const askedBefore = network.brouter.length;
    await useButton(page).click();
    await answerConfirmation(page, "useSuggestedTrip", "cancel");
    await expect(suggestionDetails(page, tapped)).toBeVisible();
    await useButton(page).click();
    await answerConfirmation(page, "useSuggestedTrip", "confirm");

    // Back in normal mode with the used trip, routed with the river profile.
    await expect(findTripsButton(page)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(suggestionLines(page)).toHaveCount(0);
    await expect(panelTab(page, strings.planner.tabs.sections)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(points(page)).toHaveCount(2);
    await expect(legLines(page)).toHaveCount(1);
    await expect(legLines(page).first()).toHaveClass(/leg-paddle/);
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);
    expect(
      network.brouter
        .slice(askedBefore)
        .map((url) => url.searchParams.get("profile")),
    ).toEqual(["river"]);
    expect(network.blocked).toEqual([]);
    expect(await shownStartDate(page)).toBe(SUMMER);
  });
});

test.describe("on a phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    devices["Pixel 7"];
  test.use({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    timezoneId: "Europe/Brussels",
  });

  test("with no trip open, Use this trip makes it the trip at once", async ({
    page,
  }) => {
    const network = await serveOffline(page, { brouter: river });
    await openPlanner(page);
    await findTrips(page, { paddleKm: 10, date: SUMMER });
    await suggestionRowButton(page, 1).click();
    const details = suggestionDetails(page, 1);
    await expect(details).toBeVisible();
    for (const button of [backButton(page), useButton(page)]) {
      await expect(button).toBeInViewport();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await useButton(page).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(findTripsButton(page)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(legLines(page).first()).toHaveClass(/leg-routed/);
    expect(network.blocked).toEqual([]);
  });
});

/**
 * Taps the line of the first suggestion with a part on top of the others in the free part of the
 * map (suggestions on one river overlap) and returns its number.
 */
async function tapSomeSuggestionLine(page: Page): Promise<number> {
  for (let n = 1; n <= 10; n++) {
    const at = await pointOnPath(page, suggestionHitLine(page, n)).catch(
      () => null,
    );
    if (!at) continue;
    await page.mouse.click(at.x, at.y);
    return n;
  }
  throw new Error("no suggestion's line can be tapped");
}
