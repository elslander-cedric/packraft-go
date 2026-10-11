// Acceptance tests for #5 (paddle legs snap to rivers), written by the tester
// from the ticket, spec #2 and ADRs 0014, 0016, 0018 before reading the diff.
// Seam 1: the core, with an injected router. Never calls live BRouter (ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBRouterRouter } from "../routing/brouter";
import type { RouteResult, Router } from "./router";
import { createAutoRouter, retryLeg } from "./routing";
import { summarise } from "./summarise";
import {
  applyEdit,
  canUndo,
  emptyTrip,
  putInsAndTakeOuts,
  type Edit,
  type LatLng,
  type LegMode,
  type Trip,
} from "./trip";

const P = [
  { lat: 50.21, lng: 4.94 },
  { lat: 50.216, lng: 4.933 },
  { lat: 50.237, lng: 4.912 },
  { lat: 50.24, lng: 4.9 },
  { lat: 50.25, lng: 4.89 },
];

const track = (from: LatLng, to: LatLng, start = 100, end = 90): RouteResult => ({
  ok: true,
  geometry: [
    { ...from, elevation: start },
    { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2, elevation: start + 20 },
    { ...to, elevation: end },
  ],
  climbM: 33,
});

type Call = { mode: LegMode; points: readonly LatLng[]; answer: (r: RouteResult) => void };

/** A router whose requests are answered by the test, so timing is under control. */
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
  const retry = (i: number) => {
    update((t) => retryLeg(t, i));
    return auto.sync(state.trip);
  };
  return { state, edit, retry };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const statuses = (trip: Trip) => trip.legs.map((l) => l.route?.status);
const modes = (trip: Trip) => trip.legs.map((l) => l.mode);
const setMode = (index: number, mode: LegMode): Edit => ({ type: "setLegMode", index, mode });
const undo: Edit = { type: "undo" };

/** Draws `n` points, answers every hike request, so all legs are routed hike legs. */
async function routedHikeTrip(n = 4) {
  const { router, calls } = manualRouter();
  const p = planner(router);
  for (const at of P.slice(0, n)) void p.edit({ type: "addPoint", at });
  for (const c of calls) c.answer(track(c.points[0], c.points[1]));
  await flush();
  expect(statuses(p.state.trip)).toEqual(Array(n - 1).fill("routed"));
  expect(calls.every((c) => c.mode === "hike")).toBe(true);
  return { ...p, calls };
}

describe("AC1: a leg's mode can be switched hike <-> paddle (an edit, undoable)", () => {
  it("new legs are hike legs; switching changes only that leg's mode", async () => {
    const { state, edit } = await routedHikeTrip();
    void edit(setMode(1, "paddle"));
    expect(modes(state.trip)).toEqual(["hike", "paddle", "hike"]);
    void edit(setMode(1, "hike"));
    expect(modes(state.trip)).toEqual(["hike", "hike", "hike"]);
  });

  it("is recorded as an undo step; undo brings back the mode and the earlier routed result without a new request", async () => {
    const { state, edit, calls } = await routedHikeTrip();
    const hikeLeg = state.trip.legs[1];
    void edit(setMode(1, "paddle"));
    calls.at(-1)!.answer(track(P[1], P[2], 99, 92));
    await flush();
    expect(state.trip.legs[1].mode).toBe("paddle");
    expect(canUndo(state.trip)).toBe(true);
    const requests = calls.length;

    await edit(undo);
    expect(state.trip.legs[1]).toEqual(hikeLeg);
    expect(statuses(state.trip)).toEqual(["routed", "routed", "routed"]);
    expect(calls).toHaveLength(requests);
  });

  it("undo restores the earlier mode even while the paddle request is still in flight, and the late answer is ignored", async () => {
    const { state, edit, calls } = await routedHikeTrip();
    const hikeLeg = state.trip.legs[1];
    void edit(setMode(1, "paddle"));
    expect(statuses(state.trip)).toEqual(["routed", "pending", "routed"]);
    void edit(undo);
    expect(state.trip.legs[1]).toEqual(hikeLeg);

    calls.at(-1)!.answer(track(P[1], P[2], 99, 92));
    await flush();
    expect(state.trip.legs[1]).toEqual(hikeLeg);
  });

  it("switching to the mode a leg already has, or switching a leg that doesn't exist, changes nothing and adds no undo step", async () => {
    const { state, edit, calls } = await routedHikeTrip(2);
    const before = state.trip;
    void edit(setMode(0, "hike"));
    void edit(setMode(5, "paddle"));
    void edit(setMode(-1, "paddle"));
    expect(state.trip).toBe(before);
    expect(calls).toHaveLength(1);
  });

  it("repeated undo walks back through several mode switches in order", async () => {
    const { state, edit, calls } = await routedHikeTrip();
    void edit(setMode(0, "paddle"));
    void edit(setMode(2, "paddle"));
    for (const c of calls.slice(3)) c.answer(track(c.points[0], c.points[1]));
    await flush();
    expect(modes(state.trip)).toEqual(["paddle", "hike", "paddle"]);
    await edit(undo);
    expect(modes(state.trip)).toEqual(["paddle", "hike", "hike"]);
    await edit(undo);
    expect(modes(state.trip)).toEqual(["hike", "hike", "hike"]);
    expect(statuses(state.trip)).toEqual(["routed", "routed", "routed"]);
  });
});

describe("AC2: switching re-routes only that leg, with the profile of its new mode", () => {
  it("switching the middle leg sends exactly one request, for paddle, through that leg's points; other legs keep their routes", async () => {
    const { state, edit, calls } = await routedHikeTrip();
    const [first, , last] = state.trip.legs;
    void edit(setMode(1, "paddle"));
    expect(calls.slice(3).map((c) => [c.mode, c.points])).toEqual([["paddle", [P[1], P[2]]]]);
    expect(statuses(state.trip)).toEqual(["routed", "pending", "routed"]);
    expect(state.trip.legs[0]).toBe(first);
    expect(state.trip.legs[2]).toBe(last);

    calls[3].answer(track(P[1], P[2], 99, 92));
    await flush();
    expect(statuses(state.trip)).toEqual(["routed", "routed", "routed"]);
    expect(state.trip.legs[0]).toBe(first);
    expect(state.trip.legs[2]).toBe(last);
  });

  it("a late hike answer never lands on a leg that was switched to paddle meanwhile", async () => {
    const { router, calls } = manualRouter();
    const p = planner(router);
    void p.edit({ type: "addPoint", at: P[0] });
    void p.edit({ type: "addPoint", at: P[1] });
    expect(calls.map((c) => c.mode)).toEqual(["hike"]);
    void p.edit(setMode(0, "paddle"));
    expect(calls.map((c) => c.mode)).toEqual(["hike", "paddle"]);

    calls[0].answer(track(P[0], P[1], 100, 140));
    await flush();
    expect(p.state.trip.legs[0]).toEqual({ mode: "paddle", route: { status: "pending" } });
    calls[1].answer(track(P[0], P[1], 99, 92));
    await flush();
    expect(summarise(p.state.trip).legs[0].dropM).toBe(7);
  });

  it("a failed hike leg switched to paddle is routed again with the river profile", async () => {
    const { router, calls } = manualRouter();
    const p = planner(router);
    void p.edit({ type: "addPoint", at: P[0] });
    void p.edit({ type: "addPoint", at: P[1] });
    calls[0].answer({ ok: false, failure: { kind: "no-route" } });
    await flush();
    expect(statuses(p.state.trip)).toEqual(["failed"]);
    void p.edit(setMode(0, "paddle"));
    expect(calls.map((c) => c.mode)).toEqual(["hike", "paddle"]);
    expect(statuses(p.state.trip)).toEqual(["pending"]);
  });
});

describe("paddle-leg routing failure (hand-made via the fake router; no recorded river no-route)", () => {
  async function paddleThatFails(kind: "no-route" | "unavailable") {
    const { state, edit, retry, calls } = await routedHikeTrip(3);
    void edit(setMode(1, "paddle"));
    calls.at(-1)!.answer({ ok: false, failure: { kind } });
    await flush();
    return { state, edit, retry, calls };
  }

  it("the leg stays in the trip as a failed paddle leg, measured as a straight line, with no drop", async () => {
    const { state } = await paddleThatFails("no-route");
    expect(modes(state.trip)).toEqual(["hike", "paddle"]);
    expect(state.trip.legs[1].route).toEqual({ status: "failed", failure: { kind: "no-route" } });
    const leg = summarise(state.trip).legs[1];
    expect(leg.dropM).toBeUndefined();
    expect(leg.climbM).toBeUndefined();
    expect(leg.distanceKm).toBeGreaterThan(0);
    // The put-in is still marked: the mode is what counts, not the routing.
    // Updated in round 2: a trip that ends on the water has a take-out at its end.
    expect(putInsAndTakeOuts(state.trip)).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 2 },
    ]);
  });

  it("retry asks the river profile again and the leg snaps once it succeeds", async () => {
    const { state, retry, calls } = await paddleThatFails("unavailable");
    const before = calls.length;
    void retry(1);
    expect(calls.slice(before).map((c) => [c.mode, c.points])).toEqual([["paddle", [P[1], P[2]]]]);
    calls.at(-1)!.answer(track(P[1], P[2], 99, 92));
    await flush();
    expect(statuses(state.trip)).toEqual(["routed", "routed"]);
    expect(summarise(state.trip).legs[1].dropM).toBe(7);
  });

  it("undo after a failed switch brings back the routed hike leg", async () => {
    const { state, edit } = await paddleThatFails("no-route");
    await edit(undo);
    expect(modes(state.trip)).toEqual(["hike", "hike"]);
    expect(statuses(state.trip)).toEqual(["routed", "routed"]);
  });
});

describe("AC5: paddle legs show drop; hike legs keep climb and descent", () => {
  const routed = (mode: LegMode, elevations: number[], climbM?: number): Trip => {
    const geometry = elevations.map((elevation, i) => ({ lat: 50, lng: 5 + i * 0.01, elevation }));
    return {
      ...emptyTrip(),
      points: [geometry[0], geometry[geometry.length - 1]],
      legs: [{ mode, route: { status: "routed", geometry, ...(climbM !== undefined && { climbM }) } }],
    };
  };

  it("drop is put-in elevation minus take-out elevation, from the per-point elevations, ignoring the router's climb", () => {
    const leg = summarise(routed("paddle", [120, 130, 95, 110, 104], 25)).legs[0];
    expect(leg.dropM).toBe(16);
    expect(leg.climbM).toBeUndefined();
    expect(leg.descentM).toBeUndefined();
  });

  it("the same geometry as a hike leg has climb and descent and no drop", () => {
    const leg = summarise(routed("hike", [120, 130, 95, 110, 104], 25)).legs[0];
    expect(leg.dropM).toBeUndefined();
    expect(leg.climbM).toBe(25);
    expect(leg.descentM).toBeGreaterThan(0);
  });

  it("switching a routed leg's mode never leaves stale figures from the old mode", async () => {
    const { state, edit } = await routedHikeTrip(2);
    expect(summarise(state.trip).legs[0].climbM).toBeDefined();
    void edit(setMode(0, "paddle"));
    const pending = summarise(state.trip).legs[0];
    expect(pending.mode).toBe("paddle");
    expect(pending.climbM).toBeUndefined();
    expect(pending.descentM).toBeUndefined();
    expect(pending.dropM).toBeUndefined();
  });
});

describe("AC6: the recorded river fixture (Lesse near Anseremme) through the adapter and core", () => {
  it("asks BRouter for the river profile and gives the Lesse track its length and drop", async () => {
    const body = readFileSync(path.join(__dirname, "../routing/fixtures/river-success.geojson"), "utf8");
    const urls: string[] = [];
    const brouter = createBRouterRouter({
      fetch: async (url) => {
        urls.push(url);
        return new Response(body, { status: 200 });
      },
    });
    const p = planner(brouter);
    await p.edit({ type: "addPoint", at: { lat: 50.216, lng: 4.933 } });
    await p.edit({ type: "addPoint", at: { lat: 50.237, lng: 4.912 } });
    await p.edit(setMode(0, "paddle"));

    expect(urls.map((u) => new URL(u).searchParams.get("profile"))).toEqual(["hiking-mountain", "river"]);
    const leg = summarise(p.state.trip).legs[0];
    expect(leg.mode).toBe("paddle");
    expect(leg.distanceKm).toBeCloseTo(5.9, 1);
    expect(leg.dropM).toBeCloseTo(7.25, 2);
  });
});

describe("AC4: put-ins and take-outs at mode changes", () => {
  const withModes = (...m: LegMode[]): Trip => ({
    ...emptyTrip(),
    points: P.slice(0, m.length + 1),
    legs: m.map((mode) => ({ mode })),
  });

  it("an all-hike trip, or an empty one, has none", () => {
    expect(putInsAndTakeOuts(emptyTrip())).toEqual([]);
    expect(putInsAndTakeOuts(withModes("hike", "hike"))).toEqual([]);
  });

  it("hike -> paddle -> hike: a put-in where the paddle leg starts and a take-out where it ends", () => {
    expect(putInsAndTakeOuts(withModes("hike", "paddle", "hike"))).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 2 },
    ]);
  });

  it("a portage (paddle, short hike, paddle; ADR 0016) gives a take-out then a put-in", () => {
    // Updated in round 2: the trip starts and ends on the water, so its start
    // is a put-in and its end a take-out.
    expect(putInsAndTakeOuts(withModes("paddle", "hike", "paddle"))).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 1 },
      { kind: "put-in", point: 2 },
      { kind: "take-out", point: 3 },
    ]);
  });

  it("consecutive paddle legs make one stretch on the water, with no marker between them", () => {
    expect(putInsAndTakeOuts(withModes("hike", "paddle", "paddle", "hike"))).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 3 },
    ]);
  });

  it("markers follow edits: deleting the put-in point merges into the earlier (hike) leg and removes the marker", () => {
    const trip = applyEdit(withModes("hike", "paddle", "hike"), { type: "deletePoint", index: 1 });
    expect(modes(trip)).toEqual(["hike", "hike"]);
    expect(putInsAndTakeOuts(trip)).toEqual([]);
  });
});

// Round 2 acceptance tests, written by the tester from the three rules Cedric
// approved (trip ends on the water; 2 m rise rule, ADR 0018; river no-route message).
describe("Round 2, rule 1: a trip that starts or ends on the water is marked at its ends", () => {
  const withModes = (...m: LegMode[]): Trip => ({
    ...emptyTrip(),
    points: P.slice(0, m.length + 1),
    legs: m.map((mode) => ({ mode })),
  });

  it("a single point, or a trip with no legs, has no markers", () => {
    expect(putInsAndTakeOuts({ ...emptyTrip(), points: [P[0]], legs: [] })).toEqual([]);
  });

  it("one paddle leg: put-in at the start, take-out at the end", () => {
    expect(putInsAndTakeOuts(withModes("paddle"))).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 1 },
    ]);
  });

  it("an all-paddle trip is one stretch: put-in at the start, take-out at the end, nothing between", () => {
    expect(putInsAndTakeOuts(withModes("paddle", "paddle", "paddle"))).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 3 },
    ]);
  });

  it("starting on the water then hiking: put-in at 0, take-out where the hike begins, nothing at the trip's end", () => {
    expect(putInsAndTakeOuts(withModes("paddle", "hike", "hike"))).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 1 },
    ]);
  });

  it("markers follow edits: deleting the last hike point makes the trip end on the water; undo brings it back", () => {
    const start = withModes("hike", "paddle", "hike");
    const deleted = applyEdit(start, { type: "deletePoint", index: 3 });
    expect(modes(deleted)).toEqual(["hike", "paddle"]);
    expect(putInsAndTakeOuts(deleted)).toEqual([
      { kind: "put-in", point: 1 },
      { kind: "take-out", point: 2 },
    ]);
    const undone = applyEdit(deleted, undo);
    expect(putInsAndTakeOuts(undone)).toEqual(putInsAndTakeOuts(start));
  });
});

describe("Round 2, rule 2: a paddle leg rise of 2 m or less is drop 0; a larger rise is a rise (ADR 0018)", () => {
  const leg = (mode: LegMode, start: number, end: number) =>
    summarise({
      ...emptyTrip(),
      points: [P[0], P[1]],
      legs: [
        {
          mode,
          route: {
            status: "routed",
            geometry: [
              { ...P[0], elevation: start },
              { lat: 50.213, lng: 4.937, elevation: Math.max(start, end) + 10 },
              { ...P[1], elevation: end },
            ],
          },
        },
      ],
    }).legs[0];

  it("level and small rises (0, 0.1, 1.99, exactly 2 m) show a drop of 0 and no rise", () => {
    for (const rise of [0, 0.1, 1.99, 2]) {
      const l = leg("paddle", 100, 100 + rise);
      expect(l.dropM, `rise ${rise}`).toBe(0);
      expect(l.riseM, `rise ${rise}`).toBeUndefined();
    }
  });

  it("a rise just over 2 m becomes a rise and has no drop", () => {
    const l = leg("paddle", 100, 102.01);
    expect(l.dropM).toBeUndefined();
    expect(l.riseM).toBeCloseTo(2.01, 5);
  });

  it("a normal drop is unchanged and has no rise", () => {
    const l = leg("paddle", 100, 92.5);
    expect(l.dropM).toBe(7.5);
    expect(l.riseM).toBeUndefined();
  });

  it("a hike leg that ends higher has climb and descent, never a drop or a rise", () => {
    const l = leg("hike", 100, 120);
    expect(l.climbM).toBeGreaterThan(0);
    expect(l.dropM).toBeUndefined();
    expect(l.riseM).toBeUndefined();
  });

  it("an unrouted paddle leg has neither drop nor rise", async () => {
    const { state, edit } = await routedHikeTrip(2);
    void edit(setMode(0, "paddle"));
    const l = summarise(state.trip).legs[0];
    expect(l.dropM).toBeUndefined();
    expect(l.riseM).toBeUndefined();
  });
});
