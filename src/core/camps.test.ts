// Camps and days (#8, ADR 0008): marking camps, and how camps split a trip into days.
import { describe, expect, it } from "vitest";
import type { LegRoute } from "./router";
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
