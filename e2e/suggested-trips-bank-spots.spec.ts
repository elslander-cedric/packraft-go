// Bank spots (ADR 0039, GLOSSARY "Bank spot"): in Flanders suggested trips get in and out where a
// path reaches the bank. A suggested trip through one says it is unchecked on the ground, and using
// it offers to save its bank spots as access points. Recorded BRouter answers only (ADR 0019).
import { expect, test } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { enterAccessPointEditing } from "./support/accessPointEditing";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline } from "./support/offline";
import { openPlanner, points, tripPanel } from "./support/planner";
import { findTrips, findTripsButton, suggestionDetails, suggestionRowButton, suggestionRows } from "./support/suggestedTrips";

const text = strings.planner.suggestedTrips;
/** A summer Saturday: season and hours only, no live readings. */
const SUMMER = "2027-07-10";
const byProfile = (url: URL) => ({
  status: 200,
  body: brouterFixture(url.searchParams.get("profile") === "river" ? "river-success.geojson" : "hiking-success.geojson"),
});

/** A trip on the Demer between Aarschot and Werchter, so the map opens there, in Flanders. */
const onTheDemer: Trip = {
  name: "Demer",
  points: [
    { lat: 50.985, lng: 4.83 },
    { lat: 50.968, lng: 4.7 },
  ],
  legs: [{ mode: "paddle" }],
};

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

// Bank spot data not built yet; Overpass was unavailable; resume with `OVERPASS_MAX_REQUESTS=80 npm run prepare:route-network -- --count-walks`.
test.skip("a Flemish suggested trip says its bank spots are unchecked, and using it offers to save them", async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TRIP_KEY, serialiseTrip(onTheDemer)]);
  const network = await serveOffline(page, { brouter: byProfile });
  await openPlanner(page);
  await expect(points(page)).toHaveCount(2);
  await findTrips(page, { hikeKm: null, paddleKm: null, maxSwitches: 2, shape: "either", date: SUMMER });

  await expect(suggestionRows(page).first()).toBeVisible();
  await suggestionRowButton(page, 1).click();
  const details = suggestionDetails(page, 1);
  await expect(details).toContainText(/bank spots?: unchecked on the ground/);
  const spots = Number((await details.getByText(/bank spots?: unchecked/).textContent())?.match(/^(\d+)/)?.[1]);
  expect(spots).toBeGreaterThan(0);

  // Cancelling the replace question offers nothing.
  await details.getByRole("button", { name: text.use }).click();
  await answerConfirmation(page, "useSuggestedTrip", "cancel");
  await expect(confirmDialog(page)).toHaveCount(0);

  await details.getByRole("button", { name: text.use }).click();
  await answerConfirmation(page, "useSuggestedTrip", "confirm");
  await expect(findTripsButton(page)).toHaveAttribute("aria-pressed", "false");
  const offer = confirmDialog(page);
  await expect(offer).toHaveAccessibleName(text.saveBankSpots.title(spots));
  await offer.getByRole("button", { name: text.saveBankSpots.confirm }).click();
  await expect(offer).toHaveCount(0);

  await enterAccessPointEditing(page);
  const saved = tripPanel(page).getByRole("list", { name: strings.planner.accessPointsLabel }).getByRole("listitem");
  await expect(saved).toHaveCount(spots);
  expect(network.blocked).toEqual([]);
});
