// #215: a paddle leg that passes an obstacle gets a warning, like a lock. Faked obstacles.
import { describe, expect, it } from "vitest";
import { accessAlong } from "./access";
import { dayWarnings } from "./dayWarnings";
import { PASSING_TOLERANCE_M } from "./locks";
import { obstacleGroups, obstaclesOnLine, type Obstacle, type ObstacleKind } from "./obstacle";
import type { LegRoute } from "./router";
import {
  fakeAccessRules,
  flandersSquare,
  forbiddenCanal,
  nearForbiddenCanal,
  onForbiddenCanal,
} from "./testing/fakeAccessRules";
import type { LatLng, Trip } from "./trip";
import { legsAccess, tripAccess } from "./tripAccess";

const obstacle = (spwId: number, lng: number, lat: number, kind: ObstacleKind = "dam"): Obstacle => ({
  id: `obstacle-${spwId}`,
  spwId,
  kind,
  position: [lng, lat],
  lastChanged: "2023-01-23",
  source: { title: "SPW", url: "https://example.org/spw" },
  snapshot: "2026-11-02",
});
const ids = (found: readonly Obstacle[]) => found.map((o) => o.spwId);

// 0.001 degrees of latitude is about 111 m.
const west: LatLng = { lat: 51.1, lng: 4.0 };
const east: LatLng = { lat: 51.1, lng: 4.1 };
const north: LatLng = { lat: 51.2, lng: 4.1 };

describe("obstacles on a leg's line", () => {
  it("finds an obstacle on the line", () => {
    expect(ids(obstaclesOnLine([west, east], [obstacle(1, 4.05, 51.1)]))).toEqual([1]);
  });

  it("uses the passing tolerance: an obstacle just inside it counts and one just outside doesn't", () => {
    const degrees = (m: number) => m / 111_195;
    const inside = obstacle(1, 4.05, 51.1 + degrees(PASSING_TOLERANCE_M - 5));
    const outside = obstacle(2, 4.06, 51.1 + degrees(PASSING_TOLERANCE_M + 5));
    expect(ids(obstaclesOnLine([west, east], [inside, outside]))).toEqual([1]);
  });

  it("ignores an obstacle beyond the end of the line", () => {
    expect(obstaclesOnLine([west, east], [obstacle(1, 4.2, 51.1)])).toEqual([]);
  });

  it("lists them in the order the leg meets them, whatever the data's order", () => {
    const found = [obstacle(1, 4.08, 51.1), obstacle(2, 4.02, 51.1), obstacle(3, 4.05, 51.1)];
    expect(ids(obstaclesOnLine([west, east], found))).toEqual([2, 3, 1]);
    expect(ids(obstaclesOnLine([east, west], found))).toEqual([1, 3, 2]);
  });
});

describe("obstacle warnings in the trip's access", () => {
  const routed = (a: LatLng, b: LatLng): LegRoute => ({
    status: "routed",
    geometry: [a, b].map((p) => ({ ...p, elevation: 0 })),
  });
  const rules = fakeAccessRules([flandersSquare, forbiddenCanal]);
  const today = "2026-10-14";
  const onFirst = obstacle(1, 4.05, 51.1);
  const onSecond = obstacle(2, 4.1, 51.15, "impassable");
  const obstacles = [onSecond, onFirst];
  const paddled: Trip = {
    name: "",
    points: [west, east, north],
    legs: [
      { mode: "paddle", route: routed(west, east) },
      { mode: "paddle", route: routed(east, north) },
    ],
    startDate: "2026-10-20",
  };

  it("warns on the leg, the day and the trip, in leg order, with the leg's day and date", () => {
    const access = tripAccess(paddled, rules, { today, obstacles });
    const first = expect.objectContaining({ obstacle: onFirst, leg: 0, day: 0, date: "2026-10-20" });
    const second = expect.objectContaining({ obstacle: onSecond, leg: 1, day: 0, date: "2026-10-20" });
    expect(access.legs[0]!.obstacleWarnings).toEqual([first]);
    expect(access.legs[1]!.obstacleWarnings).toEqual([second]);
    expect(access.days[0].obstacleWarnings).toEqual([first, second]);
    expect(access.trip.obstacleWarnings).toEqual([first, second]);
  });

  it("gives a section the warnings of its own legs only", () => {
    const access = tripAccess(paddled, rules, { today, obstacles });
    expect(legsAccess(access, { firstLeg: 1, lastLeg: 1 }).obstacleWarnings.map((w) => w.obstacle)).toEqual([onSecond]);
  });

  it("gives no warning on a hike leg, or on a paddle leg still being routed", () => {
    const hiked: Trip = { ...paddled, legs: [{ mode: "hike", route: routed(west, east) }, { mode: "paddle" }] };
    expect(tripAccess(hiked, rules, { today, obstacles }).trip.obstacleWarnings).toEqual([]);
  });

  it("never blocks: a leg's access status is the same with or without obstacles", () => {
    const line = [nearForbiddenCanal, onForbiddenCanal];
    const crossing: Trip = { name: "", points: line, legs: [{ mode: "paddle", route: routed(line[0], line[1]) }] };
    const blocked = tripAccess(crossing, rules, { today, obstacles: [obstacle(1, line[0].lng, line[0].lat)] });
    expect(blocked.legs[0]!.obstacleWarnings).toHaveLength(1);
    expect(blocked.legs[0]!.status).toEqual(accessAlong(line, rules, { today }));
    const open = tripAccess(paddled, rules, { today, obstacles });
    expect(open.legs[0]!.status).toEqual(tripAccess(paddled, rules, { today }).legs[0]!.status);
    expect(open.trip.warnings).toEqual([]);
  });

  it("doesn't depend on the date or the flow", () => {
    const shown = (trip: Trip, options = {}) =>
      tripAccess(trip, rules, { today, obstacles, ...options }).trip.obstacleWarnings.map((w) => w.obstacle);
    const expected = [onFirst, onSecond];
    expect(shown({ ...paddled, startDate: undefined })).toEqual(expected);
    expect(shown(paddled)).toEqual(expected);
    expect(shown({ ...paddled, startDate: today }, { flowsPending: true })).toEqual(expected);
  });

  it("gives a day's chip an obstacle kind, ahead of an aire's", () => {
    const { days } = tripAccess(paddled, rules, { today, obstacles });
    expect(dayWarnings(0, days[0], [{ kind: "put-in", point: 0, leg: 0, day: 0 }])).toEqual([
      { leg: 0, kind: "obstacle", count: 2 },
      { leg: 1, kind: "obstacle", count: 1 },
    ]);
  });
});

describe("several obstacles on one leg", () => {
  const at = (spwId: number, kind: ObstacleKind) => ({ obstacle: obstacle(spwId, 4, 51, kind), leg: 0, day: 0 });

  it("gathers them by kind, in the order the leg first meets each kind", () => {
    const groups = obstacleGroups([at(1, "rocks"), at(2, "impassable"), at(3, "rocks"), at(4, "dam"), at(5, "rocks")]);
    expect(groups.map((g) => [g.kind, g.obstacles.map((o) => o.spwId)])).toEqual([
      ["rocks", [1, 3, 5]],
      ["impassable", [2]],
      ["dam", [4]],
    ]);
  });

  it("has no groups without obstacles", () => {
    expect(obstacleGroups([])).toEqual([]);
  });
});
