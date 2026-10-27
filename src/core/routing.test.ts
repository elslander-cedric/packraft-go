// Seam 1: routing legs through an injected router (fake, never the network).
import { describe, expect, it } from "vitest";
import type { RouteResult } from "./router";
import {
  applyRoutingAction,
  createAutoRouter,
  markPending,
  retryLeg,
  storeRoute,
  type RoutingAction,
} from "./routing";
import { createFakeRouter } from "./testing/fakeRouter";
import { heldSession } from "./testing/heldSession";
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


describe("auto routing", () => {
  it("routes every leg without a routed result through the router, with the leg's mode and endpoints", async () => {
    const router = createFakeRouter({ hike: TRAIL });
    const state = heldSession(through(A, B, C));

    await createAutoRouter(router, state.dispatch).sync(state.trip);

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
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    await autoRouter.sync(state.trip);

    state.dispatch({ type: "addPoint", at: C, accessPoints: [] });
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
    const state = heldSession(through(A, B));

    const done = createAutoRouter(router, state.dispatch).sync(state.trip);
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
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);

    const first = autoRouter.sync(state.trip);
    const second = autoRouter.sync(through(A, B)); // e.g. a stale render still holding the unrouted trip
    answer.resolve(TRAIL);
    await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(state.trip.legs[0].route?.status).toBe("routed");
  });

  it("keeps a leg that fails to route, marked failed with the reason, and does not retry it by itself", async () => {
    const router = createFakeRouter({ hike: { ok: false, failure: { kind: "unavailable" } } });
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);

    await autoRouter.sync(state.trip);
    await autoRouter.sync(state.trip);

    expect(state.trip.points).toEqual([A, B]);
    expect(state.trip.legs).toEqual([{ mode: "hike", route: { status: "failed", failure: { kind: "unavailable" } } }]);
    expect(router.calls).toHaveLength(1);
  });

  it("treats a router that throws as unavailable", async () => {
    const router = { route: () => Promise.reject(new Error("boom")) };
    const state = heldSession(through(A, B));

    await createAutoRouter(router, state.dispatch).sync(state.trip);

    expect(state.trip.legs[0].route).toEqual({ status: "failed", failure: { kind: "unavailable" } });
  });

  it("routes a failed leg again after a retry", async () => {
    // The service is down for the first request and back for the second.
    const answers: RouteResult[] = [{ ok: false, failure: { kind: "unavailable" } }, TRAIL];
    let calls = 0;
    const router = { route: async () => answers[calls++] };
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    await autoRouter.sync(state.trip);
    expect(state.trip.legs[0].route?.status).toBe("failed");

    state.dispatch({ type: "retryLeg", index: 0 });
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
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);

    const first = autoRouter.sync(state.trip);
    // An edit moves B to C: the leg's endpoints change, so its route is dropped.
    state.dispatch({ type: "movePoint", index: 1, to: C });
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

  it("does not ask again for a pending leg, even after its answer has been stored", async () => {
    // A render can still hold the trip from before the answer arrived.
    const router = createFakeRouter({ hike: TRAIL });
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);

    await autoRouter.sync(state.trip);
    await autoRouter.sync({ ...through(A, B), legs: [{ mode: "hike", route: { status: "pending" } }] });

    expect(router.calls).toHaveLength(1);
    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
  });
});

describe("auto routing keeps the trip stable", () => {
  it("syncing a trip whose legs are already on the way leaves the trip object as it is", () => {
    // The UI syncs after every change; a new object here would sync again, forever.
    const router = { route: () => new Promise<RouteResult>(() => {}) };
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    void autoRouter.sync(state.trip);
    const pending = state.trip;

    void autoRouter.sync(state.trip);

    expect(state.trip).toBe(pending);
  });
});

describe("auto routing with undo", () => {
  const D = { lat: 50.32, lng: 5.49 };

  /** A router whose answers the test releases by hand, one per request. */
  function manualRouter() {
    const calls: { points: readonly LatLng[]; answer: (r: RouteResult) => void }[] = [];
    const router = {
      route: (_mode: unknown, points: readonly LatLng[]) =>
        new Promise<RouteResult>((answer) => calls.push({ points, answer })),
    };
    return { router, calls };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("syncing an older trip after the answer is stored sends no new request", async () => {
    const router = createFakeRouter({ hike: TRAIL });
    const older = through(A, B);
    const state = heldSession(older);
    const autoRouter = createAutoRouter(router, state.dispatch);

    await autoRouter.sync(older);
    await autoRouter.sync(older);

    expect(router.calls).toHaveLength(1);
    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
  });

  it("syncing an older trip with a pending leg after its failure is stored sends no new request", async () => {
    // React can render the in-between pending trip after the answer arrived.
    const router = createFakeRouter({ hike: { ok: false, failure: { kind: "unavailable" } } });
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);

    await autoRouter.sync(state.trip);
    await autoRouter.sync({ ...through(A, B), legs: [{ mode: "hike", route: { status: "pending" } }] });

    expect(router.calls).toHaveLength(1);
    expect(state.trip.legs[0].route?.status).toBe("failed");
  });

  it("a leg that was pending when undone comes back and gets the answer that arrived meanwhile, without a new request", async () => {
    const { router, calls } = manualRouter();
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    void autoRouter.sync(state.trip); // AB on the way

    // Move B while AB is on the way.
    state.dispatch({ type: "movePoint", index: 1, to: C });
    void autoRouter.sync(state.trip); // AC on the way
    calls[0].answer(TRAIL); // AB's answer: no leg AB in the trip any more
    await flush();

    state.dispatch({ type: "undo" });
    await autoRouter.sync(state.trip);

    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
    expect(calls.map((c) => c.points)).toEqual([
      [A, B],
      [A, C],
    ]);
  });

  it("a leg that was pending when undone, whose request failed, is routed again rather than left pending", async () => {
    const { router, calls } = manualRouter();
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    void autoRouter.sync(state.trip);
    state.dispatch({ type: "movePoint", index: 1, to: C });
    calls[0].answer({ ok: false, failure: { kind: "unavailable" } });
    await flush();

    state.dispatch({ type: "undo" });
    void autoRouter.sync(state.trip);

    expect(calls.map((c) => c.points)).toEqual([
      [A, B],
      [A, B],
    ]);
    calls[1].answer(TRAIL);
    await flush();
    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
  });

  it("a pending leg brought back by undo while its request is still out gets that request's answer", async () => {
    const { router, calls } = manualRouter();
    const state = heldSession(through(A, B, D));
    const autoRouter = createAutoRouter(router, state.dispatch);
    void autoRouter.sync(state.trip); // AB and BD on the way

    state.dispatch({ type: "pointClicked", index: 1 });
    state.dispatch({ type: "deleteSelectedPoint" }); // merged AD
    void autoRouter.sync(state.trip);
    state.dispatch({ type: "undo" }); // AB and BD pending again
    void autoRouter.sync(state.trip);
    calls[0].answer(TRAIL);
    calls[1].answer(TRAIL);
    await flush();

    expect(calls.map((c) => c.points)).toEqual([
      [A, B],
      [B, D],
      [A, D],
    ]);
    expect(state.trip.legs.map((leg) => leg.route?.status)).toEqual(["routed", "routed"]);
  });

  it("a routed leg undo brings back keeps its route and is not requested again", async () => {
    const router = createFakeRouter({ hike: TRAIL });
    const state = heldSession(through(A, B));
    const autoRouter = createAutoRouter(router, state.dispatch);
    await autoRouter.sync(state.trip);

    state.dispatch({ type: "movePoint", index: 1, to: C });
    await autoRouter.sync(state.trip);
    state.dispatch({ type: "undo" });
    await autoRouter.sync(state.trip);

    expect(router.calls.map((c) => c.points)).toEqual([
      [A, B],
      [A, C],
    ]);
    expect(state.trip.legs[0].route).toEqual(TRAIL_ROUTE);
  });
});

const TRAIL_ROUTE ={ status: "routed", geometry: TRAIL.ok ? TRAIL.geometry : [] } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("routing actions applied to a trip", () => {
  const hikeAB = { mode: "hike", points: [A, B] } as const;
  const routed = { status: "routed", geometry: TRAIL.ok ? TRAIL.geometry : [] } as const;

  it("markPending marks only the legs waiting for that request", () => {
    const marked = markPending(through(A, B, C), hikeAB);
    expect(marked.legs.map((leg) => leg.route)).toEqual([{ status: "pending" }, undefined]);
  });

  it("markPending leaves a routed leg and an unrelated request alone", () => {
    const trip = storeRoute(through(A, B), hikeAB, routed);
    expect(markPending(trip, hikeAB)).toBe(trip);
    const other = through(A, B);
    expect(markPending(other, { mode: "paddle", points: [A, B] })).toBe(other);
  });

  it("storeRoute stores the answer on a pending leg", () => {
    const pending = markPending(through(A, B), hikeAB);
    expect(storeRoute(pending, hikeAB, routed).legs[0].route).toEqual(routed);
  });

  it("storeRoute ignores a stale answer for a leg that changed meanwhile", () => {
    const pending = markPending(through(A, B), hikeAB);
    const changed = applyEdit(pending, { type: "setLegMode", index: 0, mode: "paddle" });
    expect(storeRoute(changed, hikeAB, routed)).toBe(changed);
    const moved = applyEdit(pending, { type: "movePoint", index: 1, to: C });
    expect(storeRoute(moved, hikeAB, routed)).toBe(moved);
  });

  it("storeRoute stores the answer on a leg that undo brought back", () => {
    const moved = applyEdit(through(A, B), { type: "movePoint", index: 1, to: C });
    const undone = applyEdit(moved, { type: "undo" });
    expect(storeRoute(undone, hikeAB, routed).legs[0].route).toEqual(routed);
  });

  it("applyRoutingAction applies both actions", () => {
    const requested = applyRoutingAction(through(A, B), { type: "routeRequested", request: hikeAB });
    expect(requested.legs[0].route).toEqual({ status: "pending" });
    const arrived = applyRoutingAction(requested, { type: "routeArrived", request: hikeAB, route: routed });
    expect(arrived.legs[0].route).toEqual(routed);
  });

  it("the auto router reports requested then arrived, and a known answer as arrived only", async () => {
    const actions: RoutingAction[] = [];
    const autoRouter = createAutoRouter(createFakeRouter({ hike: TRAIL }), (action) => actions.push(action));
    await autoRouter.sync(through(A, B));
    expect(actions.map((a) => a.type)).toEqual(["routeRequested", "routeArrived"]);
    actions.length = 0;
    await autoRouter.sync(through(A, B));
    expect(actions.map((a) => a.type)).toEqual(["routeArrived"]);
  });
});
