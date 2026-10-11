import { describe, expect, it } from "vitest";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type Edit, type LatLng, type Leg, type Trip } from "./trip";

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

// Routed results live on the leg. An edit must hand back the very same leg for
// every leg it does not change (so its routed result survives), and a new leg
// for every leg it does change (so it is routed again).
describe("edits clear routed results only for legs they change", () => {
  const trip = through(A, B, C, D, ELSEWHERE); // legs: AB, BC, CD, D-ELSEWHERE

  it("moving a point replaces only the two legs touching it", () => {
    const moved = applyEdit(trip, { type: "movePoint", index: 2, to: ELSEWHERE });
    expect(moved.legs[0]).toBe(trip.legs[0]);
    expect(moved.legs[1]).not.toBe(trip.legs[1]);
    expect(moved.legs[2]).not.toBe(trip.legs[2]);
    expect(moved.legs[3]).toBe(trip.legs[3]);
  });

  it("moving the start point replaces only the first leg", () => {
    const moved = applyEdit(trip, { type: "movePoint", index: 0, to: ELSEWHERE });
    expect(moved.legs[0]).not.toBe(trip.legs[0]);
    moved.legs.slice(1).forEach((leg, i) => expect(leg).toBe(trip.legs[i + 1]));
  });

  it("deleting a middle point replaces only the merged leg", () => {
    const deleted = applyEdit(trip, { type: "deletePoint", index: 2 });
    expect(deleted.legs).toHaveLength(3);
    expect(deleted.legs[0]).toBe(trip.legs[0]);
    expect(deleted.legs[1]).not.toBe(trip.legs[1]);
    expect(deleted.legs[1]).not.toBe(trip.legs[2]);
    expect(deleted.legs[2]).toBe(trip.legs[3]);
  });

  it("deleting an end point keeps every remaining leg", () => {
    const noStart = applyEdit(trip, { type: "deletePoint", index: 0 });
    noStart.legs.forEach((leg, i) => expect(leg).toBe(trip.legs[i + 1]));
    const noEnd = applyEdit(trip, { type: "deletePoint", index: 4 });
    noEnd.legs.forEach((leg, i) => expect(leg).toBe(trip.legs[i]));
  });

  it("adding a point keeps every existing leg", () => {
    const added = applyEdit(trip, addPoint(A));
    trip.legs.forEach((leg, i) => expect(added.legs[i]).toBe(leg));
  });
});
