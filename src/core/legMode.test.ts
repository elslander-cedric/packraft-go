// Seam 1: switching a leg between hike and paddle, and the put-ins and
// take-outs that mode changes create (#5, ADR 0017).
import { describe, expect, it } from "vitest";
import type { LegRoute, RouteResult } from "./router";
import { createAutoRouter } from "./routing";
import { heldSession } from "./testing/heldSession";
import { createFakeRouter } from "./testing/fakeRouter";
import { applyEdit, canUndo, emptyTrip, putInsAndTakeOuts, type Edit, type LatLng, type Trip } from "./trip";

const A = { lat: 50.216, lng: 4.933 };
const B = { lat: 50.226, lng: 4.925 };
const C = { lat: 50.237, lng: 4.912 };
const D = { lat: 50.24, lng: 4.9 };

const through = (...points: LatLng[]): Trip =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

const routeFor = (from: LatLng, to: LatLng): LegRoute => ({
  status: "routed",
  geometry: [
    { ...from, elevation: 100 },
    { ...to, elevation: 90 },
  ],
});

/** A trip through the points whose legs have the given modes and are all routed. */
const routedTrip = (points: LatLng[], modes: Trip["legs"][number]["mode"][]): Trip => ({
  ...through(...points),
  legs: modes.map((mode, i) => ({ mode, route: routeFor(points[i], points[i + 1]) })),
});

const setLegMode = (index: number, mode: "hike" | "paddle"): Edit => ({ type: "setLegMode", index, mode });

describe("switching a leg's mode", () => {
  it("switches a hike leg to paddle and back", () => {
    const paddle = applyEdit(through(A, B, C), setLegMode(1, "paddle"));
    expect(paddle.legs.map((leg) => leg.mode)).toEqual(["hike", "paddle"]);
    const hike = applyEdit(paddle, setLegMode(1, "hike"));
    expect(hike.legs.map((leg) => leg.mode)).toEqual(["hike", "hike"]);
  });

  it("clears the switched leg's route so it is routed again, and keeps every other route", () => {
    const trip = routedTrip([A, B, C, D], ["hike", "hike", "hike"]);
    const switched = applyEdit(trip, setLegMode(1, "paddle"));
    expect(switched.legs.map((leg) => leg.route)).toEqual([routeFor(A, B), undefined, routeFor(C, D)]);
  });

  it("clears a failed or pending route the same way", () => {
    const trip: Trip = {
      ...through(A, B, C),
      legs: [
        { mode: "hike", route: { status: "failed", failure: { kind: "no-route" } } },
        { mode: "hike", route: { status: "pending" } },
      ],
    };
    const switched = applyEdit(applyEdit(trip, setLegMode(0, "paddle")), setLegMode(1, "paddle"));
    expect(switched.legs).toEqual([{ mode: "paddle" }, { mode: "paddle" }]);
  });

  it("is an undo step: undo brings back the old mode and its routed result", () => {
    const trip = routedTrip([A, B, C], ["hike", "hike"]);
    const switched = applyEdit(trip, setLegMode(0, "paddle"));
    expect(canUndo(switched)).toBe(true);
    const undone = applyEdit(switched, { type: "undo" });
    expect(undone.legs).toEqual(trip.legs);
  });

  it("switching a leg to the mode it already has changes nothing and is not an undo step", () => {
    const trip = routedTrip([A, B], ["hike"]);
    expect(applyEdit(trip, setLegMode(0, "hike"))).toBe(trip);
  });

  it("ignores a leg that does not exist", () => {
    const trip = through(A, B);
    expect(applyEdit(trip, setLegMode(3, "paddle"))).toBe(trip);
  });
});

describe("routing after a mode switch", () => {
  const TRAIL: RouteResult = { ok: true, geometry: [{ ...A, elevation: 100 }, { ...B, elevation: 140 }] };
  const RIVER: RouteResult = { ok: true, geometry: [{ ...A, elevation: 99 }, { ...B, elevation: 92 }] };


  it("routes a leg switched to paddle with the paddle mode (river), and only that leg", async () => {
    const router = createFakeRouter({ hike: TRAIL, paddle: RIVER });
    const state = heldSession(through(A, B, C));
    const autoRouter = createAutoRouter(router, state.dispatch);
    await autoRouter.sync(state.trip);

    state.dispatch({ type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] });
    await autoRouter.sync(state.trip);

    expect(router.calls.map((call) => call.mode)).toEqual(["hike", "hike", "paddle"]);
    expect(router.calls[2].points).toEqual([A, B]);
    expect(state.trip.legs[0]).toEqual({ mode: "paddle", route: { status: "routed", geometry: RIVER.ok && RIVER.geometry } });
  });

  it("undoing a mode switch brings the hike route back without a new request", async () => {
    const router = createFakeRouter({ hike: TRAIL, paddle: RIVER });
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    await autoRouter.sync(state.trip);
    state.dispatch({ type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] });
    await autoRouter.sync(state.trip);

    state.dispatch({ type: "undo" });
    await autoRouter.sync(state.trip);

    expect(router.calls.map((call) => call.mode)).toEqual(["hike", "paddle"]);
    expect(state.trip.legs[0].mode).toBe("hike");
    expect(state.trip.legs[0].route?.status).toBe("routed");
  });
});

describe("put-ins and take-outs", () => {
  const withModes = (modes: Trip["legs"][number]["mode"][]): Trip => {
    const points = [A, B, C, D, A].slice(0, modes.length + 1);
    return { ...through(...points), legs: modes.map((mode) => ({ mode })) };
  };

  it("a trip with only hike legs has none", () => {
    expect(putInsAndTakeOuts(withModes(["hike", "hike"]))).toEqual([]);
    expect(putInsAndTakeOuts(emptyTrip())).toEqual([]);
  });

  it("marks a put-in where a hike leg ends and a paddle leg begins, and a take-out where it ends", () => {
    expect(putInsAndTakeOuts(withModes(["hike", "paddle", "hike"]))).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 2 },
    ]);
  });

  it("a portage (short hike leg between paddle legs) has a take-out before it and a put-in after it", () => {
    expect(putInsAndTakeOuts(withModes(["hike", "paddle", "hike", "paddle"]))).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 2 },
      { kind: "put-in", point: 3 },
      { kind: "take-out", point: 4 },
    ]);
  });

  it("consecutive paddle legs have no marker between them", () => {
    expect(putInsAndTakeOuts(withModes(["hike", "paddle", "paddle", "hike"]))).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 3 },
    ]);
  });

  it("a trip that starts on the water has a put-in at its start", () => {
    expect(putInsAndTakeOuts(withModes(["paddle", "hike"]))).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 1 },
    ]);
  });

  it("a trip that ends on the water has a take-out at its end", () => {
    expect(putInsAndTakeOuts(withModes(["hike", "paddle"]))).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 2 },
    ]);
  });

  it("a single paddle leg has a put-in at its start and a take-out at its end", () => {
    expect(putInsAndTakeOuts(withModes(["paddle"]))).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 1 },
    ]);
  });
});
