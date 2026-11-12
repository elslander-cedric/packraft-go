// Seam: the planner session (ADR 0025). Back to start makes the trip a loop
// (GLOSSARY "Loop", ADR 0017): a leg from the last point back to the start.
import { addAccessPoint, updateAccessPoint } from "./accessPoints";
import { describe, expect, it } from "vitest";
import { firstSession, plannerSession, type PlannerAction, type PlannerSession } from "./plannerSession";
import { canGoBackToStart, emptyTrip, type LatLng } from "./trip";

const pointA: LatLng = { lat: 50.3527, lng: 5.4563 };
const pointB: LatLng = { lat: 50.3627, lng: 5.4563 };
const pointC: LatLng = { lat: 50.3727, lng: 5.4563 };

const run = (...actions: PlannerAction[]): PlannerSession =>
  actions.reduce(plannerSession, firstSession({ trip: emptyTrip() }));
const add = (at: LatLng): PlannerAction => ({ type: "addPoint", at, accessPoints: [], officialAires: [] });

describe("back to start", () => {
  it("adds a leg from the last point to the start point", () => {
    const { trip } = run(add(pointA), add(pointB), add(pointC), { type: "backToStart" });
    expect(trip.points).toEqual([pointA, pointB, pointC, pointA]);
    expect(trip.legs).toHaveLength(3);
  });

  it.each([
    ["an empty trip", []],
    ["a trip with only a start point", [pointA]],
  ])("is not available on %s", (_, points) => {
    const before = run(...points.map(add));
    expect(canGoBackToStart(before.trip)).toBe(false);
    expect(plannerSession(before, { type: "backToStart" })).toBe(before);
  });

  it("is available from two points: an out-and-back", () => {
    const before = run(add(pointA), add(pointB));
    expect(canGoBackToStart(before.trip)).toBe(true);
    expect(plannerSession(before, { type: "backToStart" }).trip.points).toEqual([pointA, pointB, pointA]);
  });

  it("is not available while the trip already ends on its start", () => {
    const before = run(add(pointA), add(pointB), { type: "backToStart" });
    expect(canGoBackToStart(before.trip)).toBe(false);
    expect(plannerSession(before, { type: "backToStart" })).toBe(before);
  });

  it("is available again once the end is moved off the start", () => {
    const moved = run(
      add(pointA),
      add(pointB),
      { type: "backToStart" },
      { type: "movePoint", index: 2, to: pointC, accessPoints: [], officialAires: [] },
    );
    expect(canGoBackToStart(moved.trip)).toBe(true);
  });

  it("takes the next leg's mode: the last leg's mode, unless one is given", () => {
    const paddled = run(add(pointA), add(pointB), {
      type: "setLegMode",
      index: 0,
      mode: "paddle",
      accessPoints: [],
      officialAires: [],
    });
    expect(plannerSession(paddled, { type: "backToStart" }).trip.legs.map((leg) => leg.mode)).toEqual([
      "paddle",
      "paddle",
    ]);
    expect(plannerSession(paddled, { type: "backToStart", mode: "hike" }).trip.legs.map((leg) => leg.mode)).toEqual([
      "paddle",
      "hike",
    ]);
  });

  it("is undone in one step", () => {
    const before = run(add(pointA), add(pointB), add(pointC));
    const undone = run(add(pointA), add(pointB), add(pointC), { type: "backToStart" }, { type: "undo" });
    expect(undone.trip.points).toEqual(before.trip.points);
    expect(undone.trip.legs).toEqual(before.trip.legs);
  });

  it("makes no snap offer for the closing point, though a tap on the start would", () => {
    const TIMESTAMP = "2026-10-28T08:00:00.000Z";
    const nearA: LatLng = { lat: 50.3532, lng: 5.4563 }; // about 55 m from A
    const slipway = updateAccessPoint(
      addAccessPoint([], { id: "s", at: nearA, now: TIMESTAMP }),
      "s",
      { kind: "slipway", use: "both" },
      TIMESTAMP,
    );
    const paddled = run(add(pointA), add(pointB), {
      type: "setLegMode",
      index: 0,
      mode: "paddle",
      accessPoints: [],
      officialAires: [],
    });
    // Control: a paddle leg tapped back onto A makes A a take-out, and the slipway is offered.
    expect(
      plannerSession(paddled, { type: "addPoint", at: pointA, accessPoints: slipway, officialAires: [] }).offers,
    ).toHaveLength(1);
    const after = plannerSession(paddled, { type: "backToStart" });
    expect(after.trip.points.at(-1)).toEqual(pointA);
    expect(after.offers).toEqual([]);
  });
});
