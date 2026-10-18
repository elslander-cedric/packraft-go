// Acceptance tests for #95 (auto router reports routing actions), by the tester.
import { describe, expect, it } from "vitest";
import type { RouteResult, Router } from "./router";
import { applyRoutingAction, createAutoRouter, markPending, storeRoute, type RoutingAction } from "./routing";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const P1 = { lat: 50.1, lng: 5.1 };
const P2 = { lat: 50.11, lng: 5.12 };
const through = (...points: LatLng[]) =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());
const ok: RouteResult = { ok: true, geometry: [{ ...P1, elevation: 1 }, { ...P2, elevation: 2 }] };

describe("#95 routing actions", () => {
  it("emits plain-data actions and a known answer as routeArrived without calling the router", async () => {
    let calls = 0;
    const router: Router = { route: async () => { calls++; return ok; } };
    const actions: RoutingAction[] = [];
    const auto = createAutoRouter(router, (a) => actions.push(a));
    const trip = through(P1, P2);
    await auto.sync(trip);
    expect(actions.map((a) => a.type)).toEqual(["routeRequested", "routeArrived"]);
    expect(JSON.parse(JSON.stringify(actions))).toEqual(actions);
    actions.length = 0;
    await auto.sync(trip);
    expect(calls).toBe(1);
    expect(actions.map((a) => a.type)).toEqual(["routeArrived"]);
  });

  it("pure functions do not mutate, are idempotent, and ignore stale requests", () => {
    const trip = through(P1, P2);
    const frozen = JSON.stringify(trip);
    const req = { mode: "hike" as const, points: [P1, P2] as const };
    const pending = markPending(trip, req);
    expect(JSON.stringify(trip)).toBe(frozen);
    expect(pending.legs[0].route).toEqual({ status: "pending" });
    expect(markPending(pending, req)).toBe(pending);
    const stale = { mode: "hike" as const, points: [P1, { lat: 9, lng: 9 }] as const };
    expect(storeRoute(pending, stale, { status: "pending" })).toBe(pending);
    const failed = { status: "failed", failure: { kind: "unavailable" } } as const;
    const arrived = applyRoutingAction(pending, { type: "routeArrived", request: req, route: failed });
    expect(arrived.legs[0].route).toEqual(failed);
  });
});
