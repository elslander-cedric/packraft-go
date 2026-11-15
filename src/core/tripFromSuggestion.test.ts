// Seam: using a suggested trip (ADR 0039): the trip it becomes, and the access shown in its
// details before it is used.
import { describe, expect, it } from "vitest";
import type { Position } from "./geo";
import type { Obstacle } from "./obstacle";
import type { RouteNode } from "./routeNetwork";
import type { SuggestedLeg, SuggestedTrip } from "./suggestedTrips";
import {
  agreementStretch,
  fakeAccessRules,
  flandersSquare,
} from "./testing/fakeAccessRules";
import type { Trip } from "./trip";
import { tripAccess } from "./tripAccess";
import { suggestionAccess, tripFromSuggestion } from "./tripFromSuggestion";

const rules = fakeAccessRules([flandersSquare, agreementStretch]);

// Down the agreement stretch (along 3.8 E) from 50.70 to 50.80 N, past rocks halfway.
const putIn: RouteNode = {
  id: "official-aire-1",
  kind: "official-aire",
  use: "both",
  position: [3.8, 50.7],
};
const takeOut: RouteNode = {
  id: "official-aire-2",
  kind: "official-aire",
  use: "both",
  position: [3.8, 50.8],
};
const line: Position[] = [
  [3.8, 50.7],
  [3.8, 50.75],
  [3.8, 50.8],
];
const rocks: Obstacle = {
  id: "obstacle-7",
  spwId: 7,
  kind: "rocks",
  position: [3.8, 50.75],
  lastChanged: "2026-01-01",
  source: { title: "SPW", url: "https://example.org/spw" },
  snapshot: "2026-11-02",
};
const leg: SuggestedLeg = {
  mode: "paddle",
  from: putIn.id,
  to: takeOut.id,
  distanceM: 11_100,
  waters: ["Test river"],
  records: [agreementStretch.id],
  obstacles: [rocks.id],
  line,
};
const suggestion: SuggestedTrip = {
  shape: "one-way",
  nodes: [putIn, takeOut],
  legs: [leg],
  paddleM: 11_100,
  switches: 2,
};

/** The used trip as routing leaves it when BRouter follows the suggestion's own lines. */
function routedAlongSuggestion(trip: Trip): Trip {
  return {
    ...trip,
    legs: trip.legs.map((tripLeg, i) => ({
      ...tripLeg,
      route: {
        status: "routed",
        geometry: suggestion.legs[i].line.map(([lng, lat]) => ({
          lat,
          lng,
          elevation: 100,
        })),
      },
    })),
  };
}

describe("using a suggested trip", () => {
  it("becomes a trip with a point at each node, its legs in their modes and the wished date as start date", () => {
    expect(tripFromSuggestion(suggestion, "2027-07-10")).toEqual({
      name: "",
      points: [
        { lat: 50.7, lng: 3.8 },
        { lat: 50.8, lng: 3.8 },
      ],
      legs: [{ mode: "paddle" }],
      startDate: "2027-07-10",
    });
  });

  it("its details warn of what the used trip warns of once routed along the same water", () => {
    const options = { today: "2026-11-15", obstacles: [rocks] };
    const shown = suggestionAccess(suggestion, "2027-07-10", rules, options);
    const used = tripAccess(
      routedAlongSuggestion(tripFromSuggestion(suggestion, "2027-07-10")),
      rules,
      options,
    );
    expect(shown).toEqual(used);
    expect(
      shown.legs[0]?.obstacleWarnings.map((warning) => warning.obstacle.id),
    ).toEqual(leg.obstacles);
    expect(shown.legs[0]?.date).toBe("2027-07-10");
  });
});
