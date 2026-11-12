// Inserting a point on a leg (#122, spec #114 stories 46–49, 51): tested through
// the planner session (ADR 0025), the seam the planner drives.
import { describe, expect, it } from "vitest";
import { firstSession, plannerSession, type PlannerAction, type PlannerSession } from "./plannerSession";
import type { LegRoute } from "./router";
import { applyEdit, emptyTrip, isCamp, type LatLng, type Trip } from "./trip";

// A due-north leg A→B and an eastward leg B→C, about 1.1 km and 0.7 km long.
const pointA: LatLng = { lat: 50.35, lng: 5.45 };
const pointB: LatLng = { lat: 50.36, lng: 5.45 };
const pointC: LatLng = { lat: 50.36, lng: 5.46 };
// The routed leg A→B bends east through this corner: A → BEND → B.
const BEND: LatLng = { lat: 50.355, lng: 5.46 };

const through = (...points: LatLng[]): Trip =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

const routedVia = (...points: LatLng[]): LegRoute => ({
  status: "routed",
  geometry: points.map((point) => ({ ...point, elevation: 100 })),
});

/** The trip with every leg's route set as given (not an edit: no undo step). */
const withRoutes = (trip: Trip, ...routes: LegRoute[]): Trip => ({
  ...trip,
  legs: trip.legs.map((leg, i) => (routes[i] ? { ...leg, route: routes[i] } : leg)),
});

const run = (session: PlannerSession, ...actions: PlannerAction[]) => actions.reduce(plannerSession, session);
const insert = (index: number, near: LatLng): PlannerAction => ({ type: "insertPoint", index, near });

const expectClose = (actual: LatLng, expected: LatLng) => {
  expect(actual.lat).toBeCloseTo(expected.lat, 6);
  expect(actual.lng).toBeCloseTo(expected.lng, 6);
};

describe("inserting a point on a leg", () => {
  it("on an unrouted leg, puts the point on the straight line, nearest to where it was held", () => {
    const session = firstSession({ trip: through(pointA, pointB, pointC) });
    // Held a little west of the middle of A→B.
    const after = plannerSession(session, insert(0, { lat: 50.353, lng: 5.449 }));
    expect(after.trip.points).toHaveLength(4);
    expectClose(after.trip.points[1], { lat: 50.353, lng: 5.45 });
    expect(after.trip.points[0]).toEqual(pointA);
    expect(after.trip.points[2]).toEqual(pointB);
    expect(after.trip.points[3]).toEqual(pointC);
  });

  it("on a routed leg, puts the point on the route, not on the straight line", () => {
    const trip = withRoutes(through(pointA, pointB), routedVia(pointA, BEND, pointB));
    // Held just east of the bend: the straight line A→B is about 700 m west.
    const after = plannerSession(firstSession({ trip }), insert(0, { lat: 50.355, lng: 5.4605 }));
    expectClose(after.trip.points[1], BEND);
  });

  it("on a routed leg, lands between the route's vertices", () => {
    const trip = withRoutes(through(pointA, pointB), routedVia(pointA, BEND, pointB));
    // Half way along A→BEND, held a little off the route.
    const after = plannerSession(firstSession({ trip }), insert(0, { lat: 50.3525, lng: 5.4553 }));
    const inserted = after.trip.points[1];
    expect(inserted.lat).toBeCloseTo(50.3525, 3);
    expect(inserted.lng).toBeCloseTo(5.455, 3);
  });

  it("splits the leg into two unrouted legs of its mode; the other legs keep their routes", () => {
    const paddled = applyEdit(through(pointA, pointB, pointC), { type: "setLegMode", index: 0, mode: "paddle" });
    const trip = withRoutes(paddled, routedVia(pointA, BEND, pointB), routedVia(pointB, pointC));
    const after = plannerSession(firstSession({ trip }), insert(0, BEND));
    expect(after.trip.legs).toEqual([{ mode: "paddle" }, { mode: "paddle" }, trip.legs[1]]);
  });

  it("camps stay on their points: later camps shift by one", () => {
    const camped = [0, 1, 2].reduce(
      (result, index) => applyEdit(result, { type: "toggleCamp", index }),
      through(pointA, pointB, pointC),
    );
    const after = plannerSession(firstSession({ trip: camped }), insert(0, BEND));
    const camps = after.trip.points.map((_, i) => i).filter((i) => isCamp(after.trip, i));
    expect(camps).toEqual([0, 2, 3]);
  });

  it("the selection follows the selected point when its index shifts", () => {
    const session = { ...firstSession({ trip: through(pointA, pointB, pointC) }), selectedPoint: 2 };
    expect(plannerSession(session, insert(0, BEND)).selectedPoint).toBe(3);
  });

  it("a selected point before the insert stays selected", () => {
    const session = { ...firstSession({ trip: through(pointA, pointB, pointC) }), selectedPoint: 1 };
    expect(plannerSession(session, insert(1, { lat: 50.36, lng: 5.455 })).selectedPoint).toBe(1);
  });

  it("is one undo step: undo removes the point and brings back the routed leg", () => {
    const trip = withRoutes(
      through(pointA, pointB, pointC),
      routedVia(pointA, BEND, pointB),
      routedVia(pointB, pointC),
    );
    const before = firstSession({ trip });
    const undone = run(before, insert(0, BEND), { type: "undo" });
    expect(undone.trip.points).toEqual(trip.points);
    expect(undone.trip.legs).toEqual(trip.legs);
  });

  it("does nothing on a leg that doesn't exist", () => {
    const session = firstSession({ trip: through(pointA, pointB) });
    expect(plannerSession(session, insert(1, BEND))).toBe(session);
    expect(plannerSession(session, insert(-1, BEND))).toBe(session);
  });
});
