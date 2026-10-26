// Acceptance tests for #4 (hike legs snap to trails) written
// from the issue's acceptance criteria. Seam 1: the trip planner core with an
// injected router (a hand-rolled fake, never the network).
import { describe, expect, it } from "vitest";
import type { RouteResult, Router } from "./router";
import { createAutoRouter, retryLeg } from "./routing";
import { routingInto } from "./testing/routingDispatch";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type LatLng, type LegMode, type Trip } from "./trip";

const P1 = { lat: 50.1, lng: 5.1 };
const P2 = { lat: 50.11, lng: 5.12 };
const P3 = { lat: 50.12, lng: 5.14 };
const P4 = { lat: 50.13, lng: 5.15 };

const through = (...points: LatLng[]) =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

const track = (from: LatLng, to: LatLng): RouteResult => ({
  ok: true,
  geometry: [
    { ...from, elevation: 100 },
    { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2, elevation: 140 },
    { lat: (from.lat + to.lat) / 2 + 0.001, lng: (from.lng + to.lng) / 2, elevation: 120 },
    { ...to, elevation: 130 },
  ],
});

/** The geometry of a successful result. */
const geometryOf = (result: RouteResult) => {
  if (!result.ok) throw new Error("expected a routed result");
  return result.geometry;
};

type Call = { mode: LegMode; points: readonly LatLng[]; answer: (r: RouteResult) => void };

/** A router whose answers the test releases by hand, so in-between states can be observed. */
function manualRouter() {
  const calls: Call[] = [];
  const router: Router = {
    route(mode, points) {
      return new Promise<RouteResult>((resolve) => calls.push({ mode, points, answer: resolve }));
    },
  };
  return { router, calls };
}

function planner(initial: Trip) {
  const state = { trip: initial };
  const update = (change: (trip: Trip) => Trip) => {
    state.trip = change(state.trip);
  };
  return { state, update };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("#4 AC2: legs without a routed result are routed automatically; routed legs never again", () => {
  it("routes each unrouted hike leg once, with its own endpoints, and stores the geometry", async () => {
    const { router, calls } = manualRouter();
    const { state, update } = planner(through(P1, P2, P3));
    const auto = createAutoRouter(router, routingInto(update));

    const done = auto.sync(state.trip);
    expect(calls.map((c) => [c.mode, c.points])).toEqual([
      ["hike", [P1, P2]],
      ["hike", [P2, P3]],
    ]);
    calls[0].answer(track(P1, P2));
    calls[1].answer(track(P2, P3));
    await done;

    expect(state.trip.legs.map((l) => l.route?.status)).toEqual(["routed", "routed"]);
    expect(state.trip.legs[1].route).toEqual({ status: "routed", geometry: geometryOf(track(P2, P3)) });
  });

  it("syncing the same trip repeatedly (as React effects may) asks only once per leg", async () => {
    const { router, calls } = manualRouter();
    const { state, update } = planner(through(P1, P2));
    const auto = createAutoRouter(router, routingInto(update));
    const initial = state.trip;

    void auto.sync(initial);
    void auto.sync(initial);
    void auto.sync(state.trip);
    expect(calls).toHaveLength(1);
    calls[0].answer(track(P1, P2));
    await flush();
    await auto.sync(state.trip);
    await auto.sync(state.trip);
    expect(calls).toHaveLength(1);
  });

  it("growing the trip routes only the new leg", async () => {
    const { router, calls } = manualRouter();
    const { state, update } = planner(through(P1, P2));
    const auto = createAutoRouter(router, routingInto(update));
    void auto.sync(state.trip);
    calls[0].answer(track(P1, P2));
    await flush();

    update((t) => applyEdit(t, { type: "addPoint", at: P3 }));
    void auto.sync(state.trip);
    update((t) => applyEdit(t, { type: "addPoint", at: P4 }));
    void auto.sync(state.trip);

    expect(calls.map((c) => c.points)).toEqual([
      [P1, P2],
      [P2, P3],
      [P3, P4],
    ]);
    calls[1].answer(track(P2, P3));
    calls[2].answer(track(P3, P4));
    await flush();
    expect(state.trip.legs.map((l) => l.route?.status)).toEqual(["routed", "routed", "routed"]);
  });

  it("a trip that arrives with routed legs (e.g. reopened) makes no requests at all", async () => {
    const { router, calls } = manualRouter();
    const base = through(P1, P2, P3);
    const routed: Trip = {
      ...base,
      legs: base.legs.map((l, i) => ({
        ...l,
        route: { status: "routed" as const, geometry: geometryOf(track(base.points[i], base.points[i + 1])) },
      })),
    };
    const { update } = planner(routed);
    await createAutoRouter(router, routingInto(update)).sync(routed);
    expect(calls).toHaveLength(0);
  });

  it("an answer for a leg that changed while the request was out is not applied to it", async () => {
    const { router, calls } = manualRouter();
    const { state, update } = planner(through(P1, P2));
    const auto = createAutoRouter(router, routingInto(update));
    void auto.sync(state.trip);
    // The leg's end moves (as a future move-point edit would): its route is dropped.
    update((t) => ({ ...t, points: [P1, P3], legs: [{ mode: "hike" }] }));
    void auto.sync(state.trip);
    calls[0].answer(track(P1, P2));
    await flush();
    expect(state.trip.legs[0].route?.status).toBe("pending");
    calls[1].answer(track(P1, P3));
    await flush();
    expect(state.trip.legs[0].route).toEqual({ status: "routed", geometry: geometryOf(track(P1, P3)) });
  });
});

describe("#4 AC3: pending while routing", () => {
  it("marks a leg pending as soon as its request is sent, until the answer arrives", async () => {
    const { router, calls } = manualRouter();
    const { state, update } = planner(through(P1, P2));
    void createAutoRouter(router, routingInto(update)).sync(state.trip);
    expect(state.trip.legs[0].route).toEqual({ status: "pending" });
    calls[0].answer(track(P1, P2));
    await flush();
    expect(state.trip.legs[0].route?.status).toBe("routed");
  });
});

describe("#4 AC4: failure keeps the leg and can be retried", () => {
  it("stores a typed failure, keeps the leg and its points, and retry routes it again", async () => {
    const { router, calls } = manualRouter();
    const { state, update } = planner(through(P1, P2, P3));
    const auto = createAutoRouter(router, routingInto(update));
    void auto.sync(state.trip);
    calls[0].answer(track(P1, P2));
    calls[1].answer({ ok: false, failure: { kind: "unavailable" } });
    await flush();

    expect(state.trip.points).toEqual([P1, P2, P3]);
    expect(state.trip.legs[1].route).toEqual({ status: "failed", failure: { kind: "unavailable" } });
    // A failed leg is not retried on its own.
    await auto.sync(state.trip);
    expect(calls).toHaveLength(2);
    // Failed legs still have a (straight-line) distance.
    expect(summarise(state.trip).legs[1].distanceKm).toBeGreaterThan(0);

    update((t) => retryLeg(t, 1));
    void auto.sync(state.trip);
    expect(calls).toHaveLength(3);
    expect(calls[2].points).toEqual([P2, P3]);
    expect(state.trip.legs[0].route?.status).toBe("routed");
    calls[2].answer(track(P2, P3));
    await flush();
    expect(state.trip.legs[1].route?.status).toBe("routed");
  });

  it("retry on a leg that is routed, pending, or out of range changes nothing", () => {
    const base = through(P1, P2);
    const routed: Trip = { ...base, legs: [{ mode: "hike", route: { status: "routed", geometry: [] } }] };
    const pending: Trip = { ...base, legs: [{ mode: "hike", route: { status: "pending" } }] };
    expect(retryLeg(routed, 0)).toBe(routed);
    expect(retryLeg(pending, 0)).toBe(pending);
    expect(retryLeg(routed, 5)).toBe(routed);
    expect(retryLeg(emptyTrip(), 0)).toEqual(emptyTrip());
  });

  it("a router that throws becomes an 'unavailable' failure, not a stuck pending leg", async () => {
    const throwing: Router = { route: async () => { throw new Error("boom"); } };
    const { state, update } = planner(through(P1, P2));
    await createAutoRouter(throwing, routingInto(update)).sync(state.trip);
    expect(state.trip.legs[0].route).toEqual({ status: "failed", failure: { kind: "unavailable" } });
  });
});

describe("#4 AC5: hike figures come from the routed result", () => {
  // Updated in round 2 (Cedric's decision on PR #16): climb and descent are
  // smoothed with a 5 m buffer instead of raw sums of per-point changes.
  it("distance follows the routed geometry; climb and descent are smoothed per-point elevation changes", () => {
    const base = through(P1, P2);
    const geometry = [
      { lat: 50.0, lng: 5.0, elevation: 200 },
      { lat: 50.01, lng: 5.0, elevation: 250 }, // +50
      { lat: 50.02, lng: 5.0, elevation: 230 }, // -20
      { lat: 50.03, lng: 5.0, elevation: 230 }, // 0
      { lat: 50.04, lng: 5.0, elevation: 260 }, // +30
    ];
    const trip: Trip = { ...base, legs: [{ mode: "hike", route: { status: "routed", geometry } }] };
    const leg = summarise(trip).legs[0];
    // 0.04 degrees of latitude is about 4.45 km, regardless of where P1/P2 are.
    expect(leg.distanceKm).toBeCloseTo(4.448, 2);
    // Raw sums would be 80 up / 20 down; each sustained rise or fall loses its first 5 m.
    expect(leg.climbM).toBe(70); // (50 - 5) + (30 - 5)
    expect(leg.descentM).toBe(15); // 20 - 5
    expect(summarise(trip).trip.distanceKm).toBeCloseTo(leg.distanceKm, 6);
  });

  it("legs that are not routed (none, pending, failed) show no climb or descent yet", () => {
    const base = through(P1, P2, P3, P4);
    const trip: Trip = {
      ...base,
      legs: [
        { mode: "hike" },
        { mode: "hike", route: { status: "pending" } },
        { mode: "hike", route: { status: "failed", failure: { kind: "no-route" } } },
      ],
    };
    for (const leg of summarise(trip).legs) {
      expect(leg.climbM).toBeUndefined();
      expect(leg.descentM).toBeUndefined();
    }
  });
});
