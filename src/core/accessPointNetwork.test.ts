import { describe, expect, it } from "vitest";
import type { AccessRecord, AccessRules } from "./access";
import { withAccessPoints } from "./accessPointNetwork";
import type { AccessPoint, AccessPointUse } from "./accessPoints";
import type { Bounds, Position } from "./geo";
import {
  ROUTE_NETWORK_FORMAT,
  ROUTE_NETWORK_VERSION,
  type PaddleLink,
  type RouteNetwork,
  type RouteNode,
} from "./routeNetwork";
import { defaultSettings, type TripWishes } from "./settings";
import { suggestTrips } from "./suggestedTrips";

// A river along 50.5 N from aire A (5.00 E) down to aire B (5.10 E), about 7.1 km, and your
// access points around it. 0.01° of longitude is about 708 m here, 0.01° of latitude 1112 m.
const source = { title: "Test source", url: "https://example.org/rules" };
const open: AccessRecord = {
  id: "open-1",
  name: "open-1",
  scope: "water",
  region: "test",
  rule: { type: "fixed", state: "open", text: "open" },
  geometry: {
    type: "LineString",
    coordinates: [
      [5, 50.5],
      [5.1, 50.5],
    ],
  },
  source,
  researched: "2026-10-01",
};
const rules: AccessRules = { records: [open] };

const aire = (id: string, lng: number): RouteNode => ({
  id,
  kind: "official-aire",
  use: "both",
  position: [lng, 50.5],
});
const river: PaddleLink = {
  from: "A",
  to: "B",
  direction: "downstream",
  distanceM: 7000,
  waters: ["River"],
  records: ["open-1"],
  obstacles: [],
  line: [
    [5, 50.5],
    [5.05, 50.5],
    [5.1, 50.5],
  ],
};
const network: RouteNetwork = {
  format: ROUTE_NETWORK_FORMAT,
  version: ROUTE_NETWORK_VERSION,
  title: "Test network",
  attribution: "Test",
  sources: [source],
  snapshot: "2026-11-01",
  nodes: [aire("A", 5), aire("B", 5.1)],
  paddleLinks: [river],
  walkingLinks: [],
};

function accessPoint(
  id: string,
  [lng, lat]: Position,
  use: AccessPointUse = "both",
): AccessPoint {
  return {
    id,
    position: { lat, lng },
    name: `Point ${id}`,
    nameSource: "typed",
    use,
    kind: "informal-bank",
    note: "",
    checkedOnSite: null,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
  };
}

const today = "2026-11-15";
const everywhere: Bounds = [4, 49, 6, 51];

function search(points: AccessPoint[], wishes: Partial<TripWishes>) {
  return suggestTrips({
    network: withAccessPoints(network, points, []),
    rules,
    when: { date: today, today },
    area: everywhere,
    wishes: { maxSwitches: 2, shape: "either", ...wishes },
    pace: defaultSettings,
  });
}

/** The suggested trips as "A>B>C" stop ids, in their order. */
function stops(result: ReturnType<typeof suggestTrips>): string[] {
  if (result.status !== "found") return [];
  return result.trips.map((trip) =>
    trip.nodes.map((stop) => stop.id).join(">"),
  );
}

describe("suggested trips through your access points", () => {
  it("put in at an access point on the water, paddling from it down to the next aire", () => {
    // Halfway down the river, 30 m from the water.
    const result = search([accessPoint("p1", [5.05, 50.50027])], {
      paddleKm: 3.5,
    });
    expect(stops(result)).toContain("access-point-p1>B");
    if (result.status !== "found") throw new Error("no trips");
    const trip = result.trips.find(
      (found) => found.nodes[0].id === "access-point-p1",
    )!;
    expect(trip.nodes[0]).toEqual({
      id: "access-point-p1",
      kind: "access-point",
      use: "both",
      position: [5.05, 50.50027],
    });
    expect(trip.legs[0]).toMatchObject({
      mode: "paddle",
      from: "access-point-p1",
      to: "B",
      distanceM: 3500,
      waters: ["River"],
    });
    expect(trip.legs[0].line).toEqual([
      [5.05, 50.5],
      [5.1, 50.5],
    ]);
  });

  // 0.017986° of latitude is 2000 m.
  const twoKmNorthOfA: Position = [5, 50.517986];

  it("walk from an access point to an aire nearby, estimated as the straight line times the detour factor", () => {
    const result = search([accessPoint("p1", twoKmNorthOfA)], {
      hikeKm: 2.6,
      paddleKm: 7,
    });
    expect(stops(result)[0]).toBe("access-point-p1>A>B");
    if (result.status !== "found") throw new Error("no trips");
    const [walk] = result.trips[0].legs;
    expect(walk).toMatchObject({
      mode: "hike",
      from: "access-point-p1",
      to: "A",
      climbM: 0,
      descentM: 0,
      line: [twoKmNorthOfA, [5, 50.5]],
    });
    // 2 km as the crow flies, times 1.3.
    expect(walk.distanceM).toBeCloseTo(2600, -1);
  });

  it("never estimate a walk over the walking ceiling", () => {
    // 12 km north of A: 15.6 km walked, over the 15 km ceiling.
    const result = search([accessPoint("p1", [5, 50.6079])], { paddleKm: 7 });
    expect(
      stops(result).filter((trip) => trip.includes("access-point-p1")),
    ).toEqual([]);
  });

  it("take out at a take-out-only access point on the water, never put in there", () => {
    const result = search([accessPoint("p1", [5.05, 50.50027], "take-out")], {
      paddleKm: 3.5,
    });
    const paddles = (result.status === "found" ? result.trips : []).flatMap(
      (trip) => trip.legs.filter((leg) => leg.mode === "paddle"),
    );
    expect(paddles.map((leg) => `${leg.from}>${leg.to}`)).toContain(
      "A>access-point-p1",
    );
    expect(paddles.filter((leg) => leg.from === "access-point-p1")).toEqual([]);
  });

  it("split the river at an access point, each part passing only the obstacles on it", () => {
    const withObstacles: RouteNetwork = {
      ...network,
      paddleLinks: [{ ...river, obstacles: ["rocks-up", "weir-down", "unknown"] }],
    };
    // Rocks a quarter down, a weir three quarters down; "unknown" has no known position.
    const obstacles = [
      { id: "rocks-up", position: [5.025, 50.5001] as Position },
      { id: "weir-down", position: [5.075, 50.4999] as Position },
    ];
    const joined = withAccessPoints(withObstacles, [accessPoint("p1", [5.05, 50.50027])], obstacles);
    expect(joined.paddleLinks.map(({ from, to, obstacles: passed }) => ({ from, to, passed }))).toEqual([
      { from: "A", to: "access-point-p1", passed: ["rocks-up", "unknown"] },
      { from: "access-point-p1", to: "B", passed: ["weir-down", "unknown"] },
    ]);
  });

  it("get in and out at the aire itself when an access point is next to it on the water", () => {
    // 20 m down the river from A.
    const joined = withAccessPoints(network, [
      accessPoint("p1", [5.00028, 50.5]),
    ], []);
    expect(joined.paddleLinks).toEqual([river]);
  });
});
