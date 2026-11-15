// Your access points in suggested trips (ADR 0039, ADR 0023): a stored access point on open
// water is a put-in the search may use, its details name it, and Use this trip places the first
// point there.
import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { openPlanner, points } from "./support/planner";
import {
  findTrips,
  suggestionDetails,
  suggestionRowButton,
  suggestionRows,
} from "./support/suggestedTrips";

const text = strings.planner.suggestedTrips;
/** A summer Saturday: season and hours only, no live readings. */
const SUMMER = "2027-07-10";
const NAME = "Meadow by the bridge";
// On the water halfway between two official aires, 4 km above the lower one.
const AT = { lat: 49.77988, lng: 5.11831 };
const T = "2026-11-01T08:00:00.000Z";
const accessPoints = JSON.stringify({
  format: "packraft-go-access-points",
  version: 1,
  accessPoints: [
    {
      id: "meadow",
      position: AT,
      name: NAME,
      nameSource: "typed",
      use: "put-in",
      kind: "informal-bank",
      note: "",
      checkedOnSite: null,
      createdAt: T,
      updatedAt: T,
    },
  ],
});

test.use({
  viewport: { width: 1400, height: 900 },
  timezoneId: "Europe/Brussels",
});

test("with an access point stored, suggest a trip that puts in there, name it, and use it from there", async ({
  page,
}) => {
  const network = await serveOffline(page, {
    brouter: () => ({
      status: 200,
      body: brouterFixture("river-success.geojson"),
    }),
  });
  await page.addInitScript(
    (save) => localStorage.setItem("packraft-go.access-points", save),
    accessPoints,
  );
  await openPlanner(page);
  await findTrips(page, {
    hikeKm: null,
    paddleKm: 4,
    maxSwitches: 2,
    date: SUMMER,
  });

  await expect(suggestionRows(page).first()).toBeVisible();
  await suggestionRowButton(page, 1).click();
  const details = suggestionDetails(page, 1);
  await expect(details).toContainText(`${text.accessPointsLabel}: ${NAME}`);

  await details.getByRole("button", { name: text.use }).click();
  await expect(points(page)).toHaveCount(2);
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await page.evaluate(() =>
            localStorage.getItem("packraft-go.trip"),
          ))!,
        ).trip.points[0],
    )
    .toEqual(AT);
  expect(network.blocked).toEqual([]);
});
