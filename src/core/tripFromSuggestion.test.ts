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
import { bankSpotsOf, isTripFrom, suggestionAccess, tripFromSuggestion } from "./tripFromSuggestion";

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
  hikeM: 0,
  paddleM: 11_100,
  climbM: 0,
  descentM: 0,
  trailShare: 0,
  roadShare: 0,
  timeH: 2.22,
  switches: 2,
};

// Walk to the put-in from the west, paddle, and walk away from the take-out to the east.
const start: RouteNode = { id: "official-aire-3", kind: "official-aire", use: "both", position: [3.79, 50.7] };
const end: RouteNode = { id: "official-aire-4", kind: "official-aire", use: "both", position: [3.81, 50.8] };
const walkLeg = (from: RouteNode, to: RouteNode): SuggestedLeg => ({
  mode: "hike",
  from: from.id,
  to: to.id,
  distanceM: 700,
  climbM: 10,
  descentM: 5,
  trailShare: 1,
  roadShare: 0,
  line: [from.position, to.position],
});
const hikeAndPaddle: SuggestedTrip = {
  ...suggestion,
  nodes: [start, putIn, takeOut, end],
  legs: [walkLeg(start, putIn), leg, walkLeg(takeOut, end)],
  hikeM: 1400,
  climbM: 20,
  descentM: 10,
  trailShare: 1,
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

  it("becomes hike and paddle legs, a point at the start and at every switch", () => {
    expect(tripFromSuggestion(hikeAndPaddle, "2027-07-10")).toEqual({
      name: "",
      points: [
        { lat: 50.7, lng: 3.79 },
        { lat: 50.7, lng: 3.8 },
        { lat: 50.8, lng: 3.8 },
        { lat: 50.8, lng: 3.81 },
      ],
      legs: [{ mode: "hike" }, { mode: "paddle" }, { mode: "hike" }],
      startDate: "2027-07-10",
    });
  });

  it("its details give access for its paddle legs only, as for hand-drawn legs", () => {
    const shown = suggestionAccess(hikeAndPaddle, "2027-07-10", rules, { today: "2026-11-15", obstacles: [rocks] });
    expect(shown.legs[0]).toBeUndefined();
    expect(shown.legs[1]?.obstacleWarnings.map((warning) => warning.obstacle.id)).toEqual(leg.obstacles);
    expect(shown.legs[2]).toBeUndefined();
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

describe("bank spots of a used suggestion", () => {
  const spotA: RouteNode = { ...putIn, id: "bank-spot-1", kind: "bank-spot" };
  const spotB: RouteNode = { ...takeOut, id: "bank-spot-2", kind: "bank-spot" };
  const throughSpots: SuggestedTrip = { ...hikeAndPaddle, nodes: [start, spotA, spotB, start] };

  it("are the suggestion's bank spots, once each, and no aire", () => {
    expect(bankSpotsOf(throughSpots).map((node) => node.id)).toEqual(["bank-spot-1", "bank-spot-2"]);
    expect(bankSpotsOf(suggestion)).toEqual([]);
  });

  it("are offered only once the trip is the suggestion", () => {
    expect(isTripFrom(tripFromSuggestion(throughSpots, "2027-07-10"), throughSpots)).toBe(true);
    expect(isTripFrom(tripFromSuggestion(suggestion, "2027-07-10"), throughSpots)).toBe(false);
  });
});
