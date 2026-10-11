import { describe, expect, it } from "vitest";
import type { LegRoute } from "./router";
import { summarise } from "./summarise";
import { applyEdit, canUndo, emptyTrip, type Edit, type LatLng, type Leg, type Trip } from "./trip";

const A = { lat: 50.35, lng: 5.45 };
const B = { lat: 50.27, lng: 5.44 };
const C = { lat: 50.18, lng: 5.57 };
const D = { lat: 50.1, lng: 5.6 };
const ELSEWHERE = { lat: 50.3, lng: 5.5 };

const addPoint = (at: LatLng): Edit => ({ type: "addPoint", at });
const through = (...points: LatLng[]): Trip => points.map(addPoint).reduce(applyEdit, emptyTrip());

describe("moving a point", () => {
  it("moves the point and the legs on either side follow it", () => {
    const trip = applyEdit(through(A, B, C), { type: "movePoint", index: 1, to: ELSEWHERE });
    expect(trip.points).toEqual([A, ELSEWHERE, C]);
    expect(trip.legs).toHaveLength(2);
    expect(summarise(trip).trip.distanceKm).toBeCloseTo(
      summarise(through(A, ELSEWHERE, C)).trip.distanceKm,
      9,
    );
  });

  it("moving the start or end point changes only that point", () => {
    const start = applyEdit(through(A, B, C), { type: "movePoint", index: 0, to: ELSEWHERE });
    expect(start.points).toEqual([ELSEWHERE, B, C]);
    const end = applyEdit(through(A, B, C), { type: "movePoint", index: 2, to: ELSEWHERE });
    expect(end.points).toEqual([A, B, ELSEWHERE]);
  });

  it("keeps each leg's mode", () => {
    const trip = applyEdit(through(A, B, C), { type: "movePoint", index: 1, to: ELSEWHERE });
    expect(trip.legs.map((leg) => leg.mode)).toEqual(["hike", "hike"]);
  });

  it("ignores a point that does not exist", () => {
    const before = through(A, B);
    expect(applyEdit(before, { type: "movePoint", index: 5, to: ELSEWHERE })).toBe(before);
  });
});

/** A trip with explicit leg modes, for edits that care about mode. */
const withModes = (points: LatLng[], modes: Leg["mode"][]): Trip => ({
  ...through(...points),
  legs: modes.map((mode) => ({ mode })),
});

describe("deleting a point", () => {
  it("merges the two legs on either side into one leg between the neighbours", () => {
    const trip = applyEdit(through(A, B, C, D), { type: "deletePoint", index: 1 });
    expect(trip.points).toEqual([A, C, D]);
    expect(trip.legs).toHaveLength(2);
  });

  it("the merged leg takes the earlier leg's mode", () => {
    const paddleThenHike = withModes([A, B, C], ["paddle", "hike"]);
    expect(applyEdit(paddleThenHike, { type: "deletePoint", index: 1 }).legs).toEqual([
      { mode: "paddle" },
    ]);
    const hikeThenPaddle = withModes([A, B, C], ["hike", "paddle"]);
    expect(applyEdit(hikeThenPaddle, { type: "deletePoint", index: 1 }).legs).toEqual([
      { mode: "hike" },
    ]);
  });

  it("deleting the start point removes the first leg", () => {
    const trip = applyEdit(withModes([A, B, C], ["paddle", "hike"]), { type: "deletePoint", index: 0 });
    expect(trip.points).toEqual([B, C]);
    expect(trip.legs).toEqual([{ mode: "hike" }]);
  });

  it("deleting the end point removes the last leg", () => {
    const trip = applyEdit(withModes([A, B, C], ["paddle", "hike"]), { type: "deletePoint", index: 2 });
    expect(trip.points).toEqual([A, B]);
    expect(trip.legs).toEqual([{ mode: "paddle" }]);
  });

  it("deleting the only point leaves an empty trip", () => {
    const trip = applyEdit(through(A), { type: "deletePoint", index: 0 });
    expect(trip.points).toEqual([]);
    expect(trip.legs).toEqual([]);
  });

  it("ignores a point that does not exist", () => {
    const before = through(A, B);
    expect(applyEdit(before, { type: "deletePoint", index: 2 })).toBe(before);
  });
});

// Routed results live on the leg (`route`). An edit drops the route of every
// leg it changes (so it is routed again) and keeps it on every other leg.
describe("edits clear routed results only for legs they change", () => {
  /** A distinct routed result per leg, so a kept route can be told apart from another leg's. */
  const routeFor = (from: LatLng, to: LatLng): LegRoute => ({
    status: "routed",
    geometry: [
      { ...from, elevation: 100 },
      { ...to, elevation: 120 },
    ],
  });
  const routedThrough = (...points: LatLng[]): Trip => {
    const trip = through(...points);
    return { ...trip, legs: trip.legs.map((leg, i) => ({ ...leg, route: routeFor(points[i], points[i + 1]) })) };
  };
  const trip = routedThrough(A, B, C, D, ELSEWHERE); // legs: AB, BC, CD, D-ELSEWHERE
  const routes = (t: Trip) => t.legs.map((leg) => leg.route);

  it("moving a point drops the routes of the two legs touching it and keeps the others", () => {
    const moved = applyEdit(trip, { type: "movePoint", index: 2, to: ELSEWHERE });
    expect(routes(moved)).toEqual([routeFor(A, B), undefined, undefined, routeFor(D, ELSEWHERE)]);
    expect(moved.legs.map((leg) => leg.mode)).toEqual(["hike", "hike", "hike", "hike"]);
  });

  it("moving the start point drops only the first leg's route", () => {
    const moved = applyEdit(trip, { type: "movePoint", index: 0, to: ELSEWHERE });
    expect(routes(moved)).toEqual([undefined, routeFor(B, C), routeFor(C, D), routeFor(D, ELSEWHERE)]);
  });

  it("moving the end point drops only the last leg's route", () => {
    const moved = applyEdit(trip, { type: "movePoint", index: 4, to: A });
    expect(routes(moved)).toEqual([routeFor(A, B), routeFor(B, C), routeFor(C, D), undefined]);
  });

  it("deleting a middle point gives an unrouted merged leg and keeps the other routes", () => {
    const deleted = applyEdit(trip, { type: "deletePoint", index: 2 });
    expect(routes(deleted)).toEqual([routeFor(A, B), undefined, routeFor(D, ELSEWHERE)]);
  });

  it("deleting an end point keeps the routes of every remaining leg", () => {
    expect(routes(applyEdit(trip, { type: "deletePoint", index: 0 }))).toEqual([
      routeFor(B, C),
      routeFor(C, D),
      routeFor(D, ELSEWHERE),
    ]);
    expect(routes(applyEdit(trip, { type: "deletePoint", index: 4 }))).toEqual([
      routeFor(A, B),
      routeFor(B, C),
      routeFor(C, D),
    ]);
  });

  it("drops a failed or pending route the same way", () => {
    const failed: LegRoute = { status: "failed", failure: { kind: "unavailable" } };
    const mixed: Trip = {
      ...trip,
      legs: [{ mode: "hike", route: failed }, { mode: "hike", route: { status: "pending" } }, ...trip.legs.slice(2)],
    };
    const moved = applyEdit(mixed, { type: "movePoint", index: 1, to: ELSEWHERE });
    expect(routes(moved)).toEqual([undefined, undefined, routeFor(C, D), routeFor(D, ELSEWHERE)]);
  });

  it("adding a point keeps every existing route and adds an unrouted leg", () => {
    const added = applyEdit(trip, addPoint(A));
    expect(routes(added)).toEqual([...routes(trip), undefined]);
  });

  it("undo brings a leg that was pending back without a route, so it is routed again", () => {
    // Its request may have been answered (or failed) in the meantime; pending would never resolve.
    const failed: LegRoute = { status: "failed", failure: { kind: "no-route" } };
    const mixed: Trip = {
      ...trip,
      legs: [{ mode: "hike", route: { status: "pending" } }, { mode: "hike", route: failed }, ...trip.legs.slice(2)],
    };
    const moved = applyEdit(mixed, { type: "movePoint", index: 4, to: A });
    expect(routes(applyEdit(moved, { type: "undo" }))).toEqual([undefined, failed, routeFor(C, D), routeFor(D, ELSEWHERE)]);
  });

  it("undo brings back the routes an edit dropped", () => {
    const moved = applyEdit(trip, { type: "movePoint", index: 2, to: ELSEWHERE });
    expect(routes(applyEdit(moved, { type: "undo" }))).toEqual(routes(trip));
    const deleted = applyEdit(trip, { type: "deletePoint", index: 2 });
    expect(routes(applyEdit(deleted, { type: "undo" }))).toEqual(routes(trip));
  });
});

describe("undo", () => {
  const undo: Edit = { type: "undo" };
  /** Points and legs only: what the planner sees. */
  const shape = (trip: Trip) => ({ points: trip.points, legs: trip.legs });

  it("undoes adding a point", () => {
    const trip = applyEdit(through(A, B, C), undo);
    expect(shape(trip)).toEqual(shape(through(A, B)));
  });

  it("undoes moving a point", () => {
    const before = through(A, B, C);
    const trip = applyEdit(applyEdit(before, { type: "movePoint", index: 1, to: ELSEWHERE }), undo);
    expect(shape(trip)).toEqual(shape(before));
  });

  it("undoes deleting a point, bringing back both legs and their modes", () => {
    const before = withModes([A, B, C], ["paddle", "hike"]);
    const trip = applyEdit(applyEdit(before, { type: "deletePoint", index: 1 }), undo);
    expect(shape(trip)).toEqual(shape(before));
  });

  it("restores the very legs from before the edit, so their routed results come back", () => {
    const before = through(A, B, C, D);
    const after = applyEdit(applyEdit(before, { type: "deletePoint", index: 1 }), undo);
    after.legs.forEach((leg, i) => expect(leg).toBe(before.legs[i]));
  });

  it("undoes add, move and delete repeatedly, back to an empty trip", () => {
    let trip = through(A, B, C);
    trip = applyEdit(trip, { type: "movePoint", index: 2, to: ELSEWHERE });
    trip = applyEdit(trip, { type: "deletePoint", index: 0 });

    const expected = [[A, B, ELSEWHERE], [A, B, C], [A, B], [A], []];
    for (const points of expected) {
      trip = applyEdit(trip, undo);
      expect(trip.points).toEqual(points);
      expect(trip.legs).toHaveLength(Math.max(0, points.length - 1));
    }
    expect(shape(trip)).toEqual(shape(emptyTrip()));
  });

  it("undo with nothing to undo leaves the trip as it is", () => {
    expect(shape(applyEdit(emptyTrip(), undo))).toEqual(shape(emptyTrip()));
    const trip = applyEdit(through(A), undo);
    expect(shape(applyEdit(trip, undo))).toEqual(shape(emptyTrip()));
  });

  it("an edit that changes nothing is not an undo step", () => {
    const trip = applyEdit(through(A, B), { type: "deletePoint", index: 9 });
    expect(applyEdit(trip, undo).points).toEqual([A]);
  });

  it("tells whether there is anything to undo", () => {
    expect(canUndo(emptyTrip())).toBe(false);
    expect(canUndo(through(A))).toBe(true);
    expect(canUndo(applyEdit(through(A), undo))).toBe(false);
  });

  it("does not change the trip it was given", () => {
    const before = through(A, B);
    const snapshot = JSON.stringify(before);
    applyEdit(before, undo);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
