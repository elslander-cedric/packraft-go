// Acceptance tests for #4 round 2 (integration with #6: drag, delete, undo),
// written by the tester from #4's routing rule ("edits clear the routed result
// of the legs they change, so changed legs get re-routed automatically and
// unchanged legs never are") and #6's "undo restores the previous state,
// including prior routed results". Seam 1: the core with an injected router.
import { describe, expect, it } from "vitest";
import type { RouteResult, Router } from "./router";
import { createAutoRouter, retryLeg } from "./routing";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type Edit, type LatLng, type LegMode, type Trip } from "./trip";

const P = [
  { lat: 50.1, lng: 5.1 },
  { lat: 50.11, lng: 5.12 },
  { lat: 50.12, lng: 5.14 },
  { lat: 50.13, lng: 5.15 },
];
const MOVED = { lat: 50.105, lng: 5.2 };

const track = (from: LatLng, to: LatLng, top = 140): RouteResult => ({
  ok: true,
  geometry: [
    { ...from, elevation: 100 },
    { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2, elevation: top },
    { ...to, elevation: 110 },
  ],
});

type Call = { mode: LegMode; points: readonly LatLng[]; answer: (r: RouteResult) => void };

function manualRouter() {
  const calls: Call[] = [];
  const router: Router = {
    route: (mode, points) => new Promise<RouteResult>((resolve) => calls.push({ mode, points, answer: resolve })),
  };
  return { router, calls };
}

/** A planner like the UI: one current trip, edits applied to it, sync after each change. */
function planner(router: Router) {
  const state = { trip: emptyTrip() as Trip };
  const update = (change: (trip: Trip) => Trip) => {
    state.trip = change(state.trip);
  };
  const auto = createAutoRouter(router, update);
  const edit = (e: Edit) => {
    update((t) => applyEdit(t, e));
    return auto.sync(state.trip);
  };
  return { state, edit, sync: () => auto.sync(state.trip), update };
}

const statuses = (trip: Trip) => trip.legs.map((l) => l.route?.status);
const flush = () => new Promise((r) => setTimeout(r, 0));
const add = (at: LatLng): Edit => ({ type: "addPoint", at });
const undo: Edit = { type: "undo" };

/** Draws P0..P3 and answers every request with a track, so all three legs are routed. */
async function routedThroughAll() {
  const { router, calls } = manualRouter();
  const p = planner(router);
  for (const at of P) void p.edit(add(at));
  for (const c of calls) c.answer(track(c.points[0], c.points[1]));
  await flush();
  expect(statuses(p.state.trip)).toEqual(["routed", "routed", "routed"]);
  expect(calls).toHaveLength(3);
  return { ...p, calls };
}

describe("edits re-route only the legs they change", () => {
  it("moving a middle point re-requests exactly its two legs, with the new endpoints", async () => {
    const { state, edit, calls } = await routedThroughAll();
    const before = state.trip.legs;
    void edit({ type: "movePoint", index: 1, to: MOVED });
    expect(calls.slice(3).map((c) => c.points)).toEqual([
      [P[0], MOVED],
      [MOVED, P[2]],
    ]);
    expect(statuses(state.trip)).toEqual(["pending", "pending", "routed"]);
    expect(state.trip.legs[2]).toBe(before[2]);
    calls[3].answer(track(P[0], MOVED));
    calls[4].answer(track(MOVED, P[2]));
    await flush();
    expect(statuses(state.trip)).toEqual(["routed", "routed", "routed"]);
    expect(calls).toHaveLength(5);
  });

  it("deleting a middle point re-requests only the merged leg; deleting an end point requests nothing", async () => {
    const { state, edit, calls } = await routedThroughAll();
    void edit({ type: "deletePoint", index: 3 });
    expect(calls).toHaveLength(3);
    expect(statuses(state.trip)).toEqual(["routed", "routed"]);
    void edit({ type: "deletePoint", index: 1 });
    expect(calls.slice(3).map((c) => c.points)).toEqual([[P[0], P[2]]]);
    expect(statuses(state.trip)).toEqual(["pending"]);
  });

  it("an answer for a leg's old endpoints is not stored on the moved leg", async () => {
    const { router, calls } = manualRouter();
    const { state, edit } = planner(router);
    void edit(add(P[0]));
    void edit(add(P[1]));
    void edit({ type: "movePoint", index: 1, to: MOVED });
    calls[0].answer(track(P[0], P[1]));
    await flush();
    expect(statuses(state.trip)).toEqual(["pending"]);
    calls[1].answer(track(P[0], MOVED, 300));
    await flush();
    const route = state.trip.legs[0].route;
    expect(route?.status === "routed" && route.geometry[2]).toEqual({ ...MOVED, elevation: 110 });
  });
});

describe("undo restores route state", () => {
  it("undoing a move brings back the earlier routes with no new request", async () => {
    const { state, edit, calls } = await routedThroughAll();
    const routedLegs = state.trip.legs;
    void edit({ type: "movePoint", index: 1, to: MOVED });
    calls[3].answer(track(P[0], MOVED));
    calls[4].answer(track(MOVED, P[2]));
    await flush();
    await edit(undo);
    expect(state.trip.points).toEqual(P);
    expect(state.trip.legs).toEqual(routedLegs);
    expect(calls).toHaveLength(5);
  });

  it("undoing a delete brings back both original routed legs with no new request", async () => {
    const { state, edit, calls } = await routedThroughAll();
    const routedLegs = state.trip.legs;
    void edit({ type: "deletePoint", index: 1 });
    await edit(undo);
    expect(state.trip.legs).toEqual(routedLegs);
    expect(calls).toHaveLength(4); // only the merged leg's request
  });

  it("undoing a move restores a failed leg as failed, and retry still works", async () => {
    const { router, calls } = manualRouter();
    const p = planner(router);
    void p.edit(add(P[0]));
    void p.edit(add(P[1]));
    calls[0].answer({ ok: false, failure: { kind: "no-route" } });
    await flush();
    void p.edit({ type: "movePoint", index: 1, to: MOVED });
    calls[1].answer(track(P[0], MOVED));
    await flush();
    await p.edit(undo);
    expect(p.state.trip.legs[0].route).toEqual({ status: "failed", failure: { kind: "no-route" } });
    expect(calls).toHaveLength(2);
    p.update((t) => retryLeg(t, 0));
    void p.sync();
    expect(calls).toHaveLength(3);
    calls[2].answer(track(P[0], P[1]));
    await flush();
    expect(statuses(p.state.trip)).toEqual(["routed"]);
  });

  it("undo to a state whose leg was pending: the leg gets the answer that arrived meanwhile, no new request", async () => {
    const { router, calls } = manualRouter();
    const { state, edit } = planner(router);
    void edit(add(P[0]));
    void edit(add(P[1])); // request 0 out, leg pending
    void edit({ type: "movePoint", index: 1, to: MOVED }); // request 1 out
    calls[0].answer(track(P[0], P[1])); // arrives after the move
    await flush();
    await edit(undo);
    expect(state.trip.points).toEqual([P[0], P[1]]);
    expect(statuses(state.trip)).toEqual(["routed"]);
    expect(calls).toHaveLength(2);
    calls[1].answer(track(P[0], MOVED)); // stale answer for the undone move
    await flush();
    const route = state.trip.legs[0].route;
    expect(route?.status === "routed" && route.geometry.at(-1)).toEqual({ ...P[1], elevation: 110 });
  });

  it("undo to a state whose request is still out: the leg waits for that request, then is routed", async () => {
    const { router, calls } = manualRouter();
    const { state, edit } = planner(router);
    void edit(add(P[0]));
    void edit(add(P[1]));
    void edit({ type: "movePoint", index: 1, to: MOVED });
    void edit(undo);
    expect(statuses(state.trip)).toEqual(["pending"]);
    expect(calls).toHaveLength(2); // request 0 is reused, not sent again
    calls[0].answer(track(P[0], P[1]));
    await flush();
    expect(statuses(state.trip)).toEqual(["routed"]);
  });

  it("undo to a state whose request failed meanwhile: the leg ends failed, not stuck pending", async () => {
    const { router, calls } = manualRouter();
    const { state, edit } = planner(router);
    void edit(add(P[0]));
    void edit(add(P[1]));
    void edit({ type: "movePoint", index: 1, to: MOVED });
    calls[0].answer({ ok: false, failure: { kind: "unavailable" } });
    await flush();
    void edit(undo);
    // Failures are not remembered, so the leg is asked for again; whatever the answer, it settles.
    expect(statuses(state.trip)).not.toContain(undefined);
    for (const c of calls.slice(2)) c.answer({ ok: false, failure: { kind: "unavailable" } });
    await flush();
    expect(statuses(state.trip)).toEqual(["failed"]);
  });

  it("undoing everything while requests are out leaves an empty trip; late answers change nothing", async () => {
    const { router, calls } = manualRouter();
    const { state, edit } = planner(router);
    for (const at of P) void edit(add(at));
    for (let i = 0; i < 4; i++) void edit(undo);
    expect(state.trip).toMatchObject({ points: [], legs: [] });
    for (const c of calls) c.answer(track(c.points[0], c.points[1]));
    await flush();
    expect(state.trip).toMatchObject({ points: [], legs: [] });
  });

  it("figures after undo match the routed figures before the edit", async () => {
    const { state, edit, calls } = await routedThroughAll();
    const before = summarise(state.trip);
    void edit({ type: "movePoint", index: 2, to: MOVED });
    for (const c of calls.slice(3)) c.answer(track(c.points[0], c.points[1], 500));
    await flush();
    expect(summarise(state.trip)).not.toEqual(before);
    await edit(undo);
    expect(summarise(state.trip)).toEqual(before);
  });
});

describe("no leg is ever left pending once its requests are answered", () => {
  it("a random mix of adds, moves, deletes and undos settles with every leg routed", async () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let run = 0; run < 25; run++) {
      const { router, calls } = manualRouter();
      const { state, edit } = planner(router);
      let answered = 0;
      for (let step = 0; step < 30; step++) {
        const n = state.trip.points.length;
        const r = rand();
        const at = { lat: 50 + Math.round(rand() * 20) / 1000, lng: 5 + Math.round(rand() * 20) / 1000 };
        if (r < 0.35 || n === 0) void edit(add(at));
        else if (r < 0.55) void edit({ type: "movePoint", index: Math.floor(rand() * n), to: at });
        else if (r < 0.7) void edit({ type: "deletePoint", index: Math.floor(rand() * n) });
        else void edit(undo);
        // Answer some of the outstanding requests, in a shuffled order.
        while (answered < calls.length && rand() < 0.5) {
          const c = calls[answered++];
          c.answer(track(c.points[0], c.points[1]));
        }
        await flush();
      }
      while (answered < calls.length) {
        const c = calls[answered++];
        c.answer(track(c.points[0], c.points[1]));
        await flush();
      }
      expect(statuses(state.trip).every((s) => s === "routed")).toBe(true);
    }
  });
});
