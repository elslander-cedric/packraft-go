// Hike + paddle suggested trips (ADR 0039): with a hike distance and a loop wished, the
// suggestions walk between waters on the network's walking links, and Use this trip makes one
// the trip with its hike and paddle legs, routed for real with recorded BRouter answers (ADR 0019).
import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { legLines, openPlanner, points, shownStartDate } from "./support/planner";
import {
  findTrips,
  findTripsButton,
  suggestionDetails,
  suggestionHikeLines,
  suggestionRowButton,
  suggestionRows,
} from "./support/suggestedTrips";

const text = strings.planner.suggestedTrips;
/** A summer Saturday: season and hours only, no live readings. */
const SUMMER = "2027-07-10";
const byProfile = (url: URL) => ({
  status: 200,
  body: brouterFixture(url.searchParams.get("profile") === "river" ? "river-success.geojson" : "hiking-success.geojson"),
});

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

test("find hike + paddle loops, see a walk's climb and trail share, and use one as hike and paddle legs", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  await openPlanner(page);
  await findTrips(page, { hikeKm: 8, paddleKm: 10, maxSwitches: 2, shape: "loop", date: SUMMER });

  // Every row is a loop that walks about 8 km and paddles about 10.
  await expect(suggestionRows(page).first()).toBeVisible();
  for (const row of await suggestionRows(page).all()) {
    await expect(row).toHaveText(/Loop · ([6-9]\.\d) km hike · (8|9|10|11|12)\.\d km paddle · 2 switches/);
  }
  await expect(suggestionHikeLines(page).first()).toBeAttached();

  await suggestionRowButton(page, 1).click();
  const details = suggestionDetails(page, 1);
  await expect(details).toBeVisible();
  await expect(details).toContainText(`${text.climbLabel}: `);
  await expect(details).toContainText(new RegExp(`${text.trailShareLabel}: \\d+% · ${text.roadShareLabel}: \\d+%`));

  const askedBefore = network.brouter.length;
  await details.getByRole("button", { name: text.use }).click();
  await expect(findTripsButton(page)).toHaveAttribute("aria-pressed", "false");
  // A loop of one walk and one paddle: back where it started.
  await expect(points(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).and(page.locator(".leg-hike"))).toHaveCount(1);
  await expect(legLines(page).and(page.locator(".leg-paddle"))).toHaveCount(1);
  await expect(legLines(page).and(page.locator(".leg-routed"))).toHaveCount(2);
  // The walk is routed with the default hike profile, as any hike leg (ADR 0039).
  const asked = network.brouter.slice(askedBefore);
  expect(asked.map((url) => url.searchParams.get("profile")).sort()).toEqual(["hiking-mountain", "river"]);
  expect(asked.every((url) => !url.searchParams.has("profile:hiking_routes_preference"))).toBe(true);
  expect(network.blocked).toEqual([]);
  expect(await shownStartDate(page)).toBe(SUMMER);
});

test("say when no trip of about the wished hike distance fits", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  await findTrips(page, { hikeKm: 40, paddleKm: 10, date: SUMMER });
  await expect(page.getByRole("status").filter({ hasText: text.reasons.hikeDistance(`40 ${strings.kilometreUnit}`) })).toBeVisible();
});
