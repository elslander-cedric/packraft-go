// Camps and days (#8, ADR 0008): marking camps, and how camps split a trip into days.
import { describe, expect, it } from "vitest";
import type { LegRoute } from "./router";
import { summarise } from "./summarise";
import { applyEdit, canUndo, emptyTrip, isCamp, type Edit, type LatLng, type Trip } from "./trip";

const A = { lat: 50.35, lng: 5.45 };
const B = { lat: 50.27, lng: 5.44 };
const C = { lat: 50.18, lng: 5.57 };
const D = { lat: 50.1, lng: 5.6 };
const ELSEWHERE = { lat: 50.3, lng: 5.5 };

const addPoint = (at: LatLng): Edit => ({ type: "addPoint", at });
const through = (...points: LatLng[]): Trip => points.map(addPoint).reduce(applyEdit, emptyTrip());
const toggleCamp = (index: number): Edit => ({ type: "toggleCamp", index });
const campsOf = (trip: Trip) => trip.points.map((_, i) => i).filter((i) => isCamp(trip, i));

const ROUTED: LegRoute = {
  status: "routed",
  geometry: [
    { ...A, elevation: 200 },
    { ...B, elevation: 180 },
  ],
};

describe("toggling a camp", () => {
  it("a new trip has no camps", () => {
    expect(campsOf(through(A, B, C))).toEqual([]);
  });

  it("marks a point as a camp, and toggling again unmarks it", () => {
    const marked = applyEdit(through(A, B, C), toggleCamp(1));
    expect(campsOf(marked)).toEqual([1]);
    expect(campsOf(applyEdit(marked, toggleCamp(1)))).toEqual([]);
  });

  it("any point can be a camp, including the start and end", () => {
    const trip = [0, 2, 1].map(toggleCamp).reduce(applyEdit, through(A, B, C));
    expect(campsOf(trip)).toEqual([0, 1, 2]);
  });

  it("ignores a point that does not exist", () => {
    const before = through(A, B);
    expect(applyEdit(before, toggleCamp(5))).toBe(before);
  });

  it("keeps every leg's route: a camp changes no leg, so nothing is routed again", () => {
    const routed: Trip = { ...through(A, B, C), legs: [{ mode: "hike", route: ROUTED }, { mode: "paddle", route: ROUTED }] };
    const marked = applyEdit(routed, toggleCamp(1));
    expect(marked.legs).toEqual(routed.legs);
    expect(marked.points).toEqual(routed.points);
  });

  it("is undoable", () => {
    const before = through(A, B, C);
    const marked = applyEdit(before, toggleCamp(1));
    expect(canUndo(marked)).toBe(true);
    const undone = applyEdit(marked, { type: "undo" });
    expect(campsOf(undone)).toEqual([]);
    expect(campsOf(applyEdit(applyEdit(marked, toggleCamp(1)), { type: "undo" }))).toEqual([1]);
  });
});

describe("camps follow their points through other edits", () => {
  const campAt = (trip: Trip, ...indices: number[]) => indices.map(toggleCamp).reduce(applyEdit, trip);

  it("a moved camp stays a camp", () => {
    const trip = applyEdit(campAt(through(A, B, C), 1), { type: "movePoint", index: 1, to: ELSEWHERE });
    expect(campsOf(trip)).toEqual([1]);
  });

  it("adding a point keeps the camps where they are", () => {
    expect(campsOf(applyEdit(campAt(through(A, B, C), 1), addPoint(D)))).toEqual([1]);
  });

  it("deleting a point before a camp keeps the camp on the same place", () => {
    const trip = applyEdit(campAt(through(A, B, C, D), 2), { type: "deletePoint", index: 1 });
    expect(trip.points).toEqual([A, C, D]);
    expect(campsOf(trip)).toEqual([1]);
  });

  it("deleting a camp's point removes the camp", () => {
    const trip = applyEdit(campAt(through(A, B, C, D), 1, 2), { type: "deletePoint", index: 1 });
    expect(trip.points).toEqual([A, C, D]);
    expect(campsOf(trip)).toEqual([1]);
  });

  it("undoing a delete brings the camp back", () => {
    const deleted = applyEdit(campAt(through(A, B, C), 1), { type: "deletePoint", index: 1 });
    expect(campsOf(applyEdit(deleted, { type: "undo" }))).toEqual([1]);
  });
});

// One degree of arc on a sphere with the Earth's mean radius (6371.0088 km).
const KM_PER_DEGREE = (6371.0088 * Math.PI) / 180;
const atKm = (km: number): LatLng => ({ lat: 0, lng: km / KM_PER_DEGREE });

/**
 * Four routed legs along the equator, worked by hand at the default settings
 * (pace 1.0, paddling 5 km/h):
 * - leg 1: hike 10 km, router climb 600 m, 300 m → 100 m (descent 195 m after the 5 m buffer): 3 h
 * - leg 2: paddle 6 km: 1.2 h
 * - leg 3: hike 6 km, router climb 300 m, flat: 1.7 h
 * - leg 4: paddle 8 km: 1.6 h
 */
function fourLegTrip(): Trip {
  const km = [0, 10, 16, 22, 30];
  const points = km.map(atKm);
  const elevations = [300, 100, 90, 90, 80];
  const route = (i: number, climbM?: number): LegRoute => ({
    status: "routed",
    geometry: [
      { ...points[i], elevation: elevations[i] },
      { ...points[i + 1], elevation: elevations[i + 1] },
    ],
    climbM,
  });
  return {
    name: "",
    points,
    legs: [
      { mode: "hike", route: route(0, 600) },
      { mode: "paddle", route: route(1) },
      { mode: "hike", route: route(2, 300) },
      { mode: "paddle", route: route(3) },
    ],
  };
}

const withCamps = (trip: Trip, ...indices: number[]) => indices.map(toggleCamp).reduce(applyEdit, trip);

describe("days", () => {
  it("an empty trip, or one with only a start point, has no days", () => {
    expect(summarise(emptyTrip()).days).toEqual([]);
    expect(summarise(through(A)).days).toEqual([]);
  });

  it("a trip without camps is one day with every leg's totals", () => {
    const { days } = summarise(fourLegTrip());
    expect(days).toHaveLength(1);
    const [day] = days;
    expect(day.firstLeg).toBe(0);
    expect(day.lastLeg).toBe(3);
    expect(day.hikeDistanceKm).toBeCloseTo(16, 6);
    expect(day.paddleDistanceKm).toBeCloseTo(14, 6);
    expect(day.climbM).toBeCloseTo(900, 6);
    expect(day.descentM).toBeCloseTo(195, 6);
    expect(day.timeH).toBeCloseTo(7.5, 6);
    expect(day.timeStatus).toBe("estimated");
  });

  it("a camp splits the trip into two days, each with its own totals", () => {
    const { days } = summarise(withCamps(fourLegTrip(), 2));
    expect(days).toHaveLength(2);
    const [first, second] = days;
    expect([first.firstLeg, first.lastLeg]).toEqual([0, 1]);
    expect(first.hikeDistanceKm).toBeCloseTo(10, 6);
    expect(first.paddleDistanceKm).toBeCloseTo(6, 6);
    expect(first.climbM).toBeCloseTo(600, 6);
    expect(first.descentM).toBeCloseTo(195, 6);
    expect(first.timeH).toBeCloseTo(4.2, 6);
    expect([second.firstLeg, second.lastLeg]).toEqual([2, 3]);
    expect(second.hikeDistanceKm).toBeCloseTo(6, 6);
    expect(second.paddleDistanceKm).toBeCloseTo(8, 6);
    expect(second.climbM).toBeCloseTo(300, 6);
    expect(second.descentM).toBeCloseTo(0, 6);
    expect(second.timeH).toBeCloseTo(3.3, 6);
  });

  it("paddle legs add no climb or descent to their day (they have a drop instead)", () => {
    const { days } = summarise(withCamps(fourLegTrip(), 1, 2));
    expect(days[1].paddleDistanceKm).toBeCloseTo(6, 6);
    expect(days[1].climbM).toBe(0);
    expect(days[1].descentM).toBe(0);
  });

  it("n camps between the start and end make n + 1 days", () => {
    const { days } = summarise(withCamps(fourLegTrip(), 1, 3));
    expect(days.map((day) => [day.firstLeg, day.lastLeg])).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
    ]);
  });

  it("a camp at the start or end point does not add an empty day", () => {
    expect(summarise(withCamps(fourLegTrip(), 0, 4)).days).toHaveLength(1);
  });

  it("day totals add up to the trip totals", () => {
    const summary = summarise(withCamps(fourLegTrip(), 2));
    const time = summary.days.reduce((total, day) => total + day.timeH, 0);
    const km = summary.days.reduce((total, day) => total + day.hikeDistanceKm + day.paddleDistanceKm, 0);
    expect(time).toBeCloseTo(summary.trip.timeH, 9);
    expect(km).toBeCloseTo(summary.trip.distanceKm, 9);
  });

  it("follow the planner's settings", () => {
    const { days } = summarise(withCamps(fourLegTrip(), 2), { paceFactor: 2, paddleSpeedKmh: 3 });
    // Day 1: hike 3 h × 2 + paddle 6 km ÷ 3 km/h.
    expect(days[0].timeH).toBeCloseTo(8, 6);
  });
});

describe("day time status (ADR 0009, as for the trip total)", () => {
  it("a day waits while any of its legs is being routed; other days are estimated", () => {
    const trip = withCamps(fourLegTrip(), 2);
    const pending: Trip = { ...trip, legs: trip.legs.with(3, { mode: "paddle" }) };
    const { days } = summarise(pending);
    expect(days[0].timeStatus).toBe("estimated");
    expect(days[1].timeStatus).toBe("pending");
  });

  it("a day with a hike leg that failed to route is marked as having no climb data", () => {
    const trip = withCamps(fourLegTrip(), 2);
    const failed: Trip = {
      ...trip,
      legs: trip.legs.with(0, { mode: "hike", route: { status: "failed", failure: { kind: "unavailable" } } }),
    };
    const { days } = summarise(failed);
    expect(days[0].timeStatus).toBe("no-climb-data");
    // Straight-line 10 km at Naismith's flat pace (2 h) plus the paddle leg (1.2 h).
    expect(days[0].timeH).toBeCloseTo(3.2, 6);
    expect(days[1].timeStatus).toBe("estimated");
  });
});
