// Seam 1: routing legs through an injected router (fake, never the network).
import { describe, expect, it } from "vitest";
import type { RouteResult } from "./router";
import { createAutoRouter, retryLeg } from "./routing";
import { createFakeRouter } from "./testing/fakeRouter";
import { applyEdit, emptyTrip, type LatLng, type Trip } from "./trip";

const A = { lat: 50.3527, lng: 5.4561 };
const B = { lat: 50.344, lng: 5.47 };
const C = { lat: 50.33, lng: 5.48 };

const through = (...points: LatLng[]) =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

const TRAIL: RouteResult = {
  ok: true,
  geometry: [
    { ...A, elevation: 150 },
    { lat: 50.35, lng: 5.46, elevation: 180 },
    { ...B, elevation: 170 },
  ],
};

/** Holds the current trip the way the UI does, applying the auto router's updates. */
function plannerState(initial: Trip) {
  const state = { trip: initial };
  const update = (change: (trip: Trip) => Trip) => {
    state.trip = change(state.trip);
  };
  return { state, update };
}

describe("auto routing", () => {
  it("routes every leg without a routed result through the router, with the leg's mode and endpoints", async () => {
    const router = createFakeRouter({ hike: TRAIL });
    const { state, update } = plannerState(through(A, B, C));

    await createAutoRouter(router, update).sync(state.trip);

    expect(router.calls).toEqual([
      { mode: "hike", points: [A, B] },
      { mode: "hike", points: [B, C] },
    ]);
    expect(state.trip.legs.map((leg) => leg.route)).toEqual([
      { status: "routed", geometry: TRAIL.ok && TRAIL.geometry },
      { status: "routed", geometry: TRAIL.ok && TRAIL.geometry },
    ]);
  });

  it("never requests a leg that already has a routed result again", async () => {
    const router = createFakeRouter({ hike: TRAIL });
    const { state, update } = plannerState(through(A, B));
    const autoRouter = createAutoRouter(router, update);
    await autoRouter.sync(state.trip);

    update((trip) => applyEdit(trip, { type: "addPoint", at: C }));
    await autoRouter.sync(state.trip);
    await autoRouter.sync(state.trip);

    expect(router.calls).toEqual([
      { mode: "hike", points: [A, B] },
      { mode: "hike", points: [B, C] },
    ]);
  });

  it("marks a leg pending while its route is on the way", async () => {
    const answer = deferred<RouteResult>();
    const router = { route: () => answer.promise };
    const { state, update } = plannerState(through(A, B));

    const done = createAutoRouter(router, update).sync(state.trip);
    expect(state.trip.legs[0].route).toEqual({ status: "pending" });

    answer.resolve(TRAIL);
    await done;
    expect(state.trip.legs[0].route?.status).toBe("routed");
  });

  it("asks only once for a leg whose route is on the way, however often it is synced", async () => {
    const answer = deferred<RouteResult>();
    let calls = 0;
    const router = {
      route: () => {
        calls++;
        return answer.promise;
      },
    };
    const { state, update } = plannerState(through(A, B));
    const autoRouter = createAutoRouter(router, update);

    const first = autoRouter.sync(state.trip);
    const second = autoRouter.sync(through(A, B)); // e.g. a stale render still holding the unrouted trip
    answer.resolve(TRAIL);
    await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(state.trip.legs[0].route?.status).toBe("routed");
  });

  it("keeps a leg that fails to route, marked failed with the reason, and does not retry it by itself", async () => {
    const router = createFakeRouter({ hike: { ok: false, failure: { kind: "unavailable" } } });
    const { state, update } = plannerState(through(A, B));
    const autoRouter = createAutoRouter(router, update);

    await autoRouter.sync(state.trip);
    await autoRouter.sync(state.trip);

    expect(state.trip.points).toEqual([A, B]);
    expect(state.trip.legs).toEqual([{ mode: "hike", route: { status: "failed", failure: { kind: "unavailable" } } }]);
    expect(router.calls).toHaveLength(1);
  });

  it("treats a router that throws as unavailable", async () => {
    const router = { route: () => Promise.reject(new Error("boom")) };
    const { state, update } = plannerState(through(A, B));

    await createAutoRouter(router, update).sync(state.trip);

    expect(state.trip.legs[0].route).toEqual({ status: "failed", failure: { kind: "unavailable" } });
  });

  it("routes a failed leg again after a retry", async () => {
    // The service is down for the first request and back for the second.
    const answers: RouteResult[] = [{ ok: false, failure: { kind: "unavailable" } }, TRAIL];
    let calls = 0;
    const router = { route: async () => answers[calls++] };
    const { state, update } = plannerState(through(A, B));
    const autoRouter = createAutoRouter(router, update);
    await autoRouter.sync(state.trip);
    expect(state.trip.legs[0].route?.status).toBe("failed");

    update((trip) => retryLeg(trip, 0));
    await autoRouter.sync(state.trip);

    expect(calls).toBe(2);
    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
  });

  it("retrying a leg that has not failed changes nothing", () => {
    const trip: Trip = { ...through(A, B), legs: [{ mode: "hike", route: TRAIL_ROUTE }] };
    expect(retryLeg(trip, 0)).toBe(trip);
  });

  it("drops an answer for a leg that changed while it was on the way, and routes the changed leg", async () => {
    const answers = [deferred<RouteResult>(), deferred<RouteResult>()];
    const calls: LatLng[][] = [];
    const router = {
      route: (_mode: unknown, points: readonly LatLng[]) => {
        calls.push([...points]);
        return answers[calls.length - 1].promise;
      },
    };
    const { state, update } = plannerState(through(A, B));
    const autoRouter = createAutoRouter(router, update);

    const first = autoRouter.sync(state.trip);
    // An edit moves B to C: the leg's endpoints change, so its route is dropped.
    update((trip) => ({ ...trip, points: [A, C], legs: [{ mode: "hike" }] }));
    const second = autoRouter.sync(state.trip);
    answers[0].resolve(TRAIL);
    await first;
    expect(state.trip.legs[0].route).toEqual({ status: "pending" });

    const otherTrail: RouteResult = { ok: true, geometry: [{ ...A, elevation: 1 }, { ...C, elevation: 2 }] };
    answers[1].resolve(otherTrail);
    await second;
    expect(calls).toEqual([
      [A, B],
      [A, C],
    ]);
    expect(state.trip.legs[0].route).toEqual({ status: "routed", geometry: otherTrail.ok && otherTrail.geometry });
  });

  it("asks again for a pending leg whose answer was lost", async () => {
    // e.g. undo restores a leg as it was while its route was on the way.
    const router = createFakeRouter({ hike: TRAIL });
    const { state, update } = plannerState({ ...through(A, B), legs: [{ mode: "hike", route: { status: "pending" } }] });

    await createAutoRouter(router, update).sync(state.trip);

    expect(router.calls).toEqual([{ mode: "hike", points: [A, B] }]);
    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
  });
});

const TRAIL_ROUTE = { status: "routed", geometry: TRAIL.ok ? TRAIL.geometry : [] } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
