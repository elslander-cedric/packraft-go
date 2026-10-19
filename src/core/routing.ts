// Routing orchestration: decides which legs to route and reports what happened.
// The router is injected, so tests pass a fake (spec #2).
//
// Contract (ADR 0025): the auto router never writes the trip. It reports plain-data
// routing actions to a dispatch: "route requested" (the legs waiting for this
// request are marked pending) and "route arrived" (the answer is stored on the
// legs still waiting for it). `markPending`, `storeRoute` and `applyRoutingAction`
// are the pure functions that apply them to a trip; whoever owns the trip applies
// them, so the router holds no trip.
import type { LegRoute, RouteResult, Router } from "./router";
import type { LatLng, Leg, LegMode, Trip } from "./trip";

export type RouteRequest = { readonly mode: LegMode; readonly points: readonly [LatLng, LatLng] };

/** What the auto router reports, as plain data. */
export type RoutingAction =
  | { readonly type: "routeRequested"; readonly request: RouteRequest }
  | { readonly type: "routeArrived"; readonly request: RouteRequest; readonly route: LegRoute };

export type RoutingDispatch = (action: RoutingAction) => void;

export type AutoRouter = {
  /**
   * Routes every leg of the trip that has no routed result yet. Resolves when
   * the routes it started have been reported.
   */
  sync(trip: Trip): Promise<void>;
};

type Request = RouteRequest;

const requestOf = (trip: Trip, i: number): Request => ({
  mode: trip.legs[i].mode,
  points: [trip.points[i], trip.points[i + 1]],
});

const sameLatLng = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

const isFor = (trip: Trip, i: number, request: Request) =>
  trip.legs[i].mode === request.mode &&
  sameLatLng(trip.points[i], request.points[0]) &&
  sameLatLng(trip.points[i + 1], request.points[1]);

function setRoutes(trip: Trip, route: LegRoute, applies: (leg: Leg, i: number) => boolean): Trip {
  if (!trip.legs.some(applies)) return trip;
  return { ...trip, legs: trip.legs.map((leg, i) => (applies(leg, i) ? { ...leg, route } : leg)) };
}

const routeOf = (result: RouteResult): LegRoute =>
  result.ok
    ? { status: "routed", geometry: result.geometry, ...(result.climbM !== undefined && { climbM: result.climbM }) }
    : { status: "failed", failure: result.failure };

/** Clears a failed leg's route so that the next sync routes it again. Other legs are left alone. */
export function retryLeg(trip: Trip, legIndex: number): Trip {
  if (trip.legs[legIndex]?.route?.status !== "failed") return trip;
  return { ...trip, legs: trip.legs.map((leg, i) => (i === legIndex ? { ...leg, route: undefined } : leg)) };
}

const keyOf = ({ mode, points: [from, to] }: Request) => `${mode}:${from.lat},${from.lng};${to.lat},${to.lng}`;

/** Legs that wait for a route: never routed, or pending (possibly brought back by undo). */
const awaitsRoute = (leg: Leg) => !leg.route || leg.route.status === "pending";

/**
 * Stores a route on every leg of the trip that `request` is for and that is
 * still waiting for one. Legs that changed meanwhile are left alone; a leg that
 * undo brought back is still waiting, so it gets the route.
 */
export function storeRoute(trip: Trip, request: Request, route: LegRoute): Trip {
  return setRoutes(
    trip,
    route,
    // A leg already pending stays as it is, so marking legs pending twice does not change the trip.
    (leg, i) => awaitsRoute(leg) && leg.route?.status !== route.status && isFor(trip, i, request),
  );
}

/** Marks every leg of the trip that `request` is for and that waits for a route as pending. */
export const markPending = (trip: Trip, request: Request): Trip => storeRoute(trip, request, { status: "pending" });

/** Applies one routing action to a trip. */
export const applyRoutingAction = (trip: Trip, action: RoutingAction): Trip =>
  action.type === "routeRequested" ? markPending(trip, action.request) : storeRoute(trip, action.request, action.route);

export function createAutoRouter(router: Router, dispatch: RoutingDispatch): AutoRouter {
  const inFlight = new Map<string, Promise<void>>();
  // Routes already received, by request. A leg that comes back unchanged (by
  // undo, or in a trip older than the stored answer) gets its route from here
  // instead of a new request. Failures are not kept: retrying must ask again.
  const received = new Map<string, LegRoute>();

  const start = (request: Request) => {
    const key = keyOf(request);
    const running = (async () => {
      let result: RouteResult;
      try {
        result = await router.route(request.mode, request.points);
      } catch {
        result = { ok: false, failure: { kind: "unavailable" } };
      }
      inFlight.delete(key);
      const route = routeOf(result);
      if (route.status === "routed") received.set(key, route);
      dispatch({ type: "routeArrived", request, route });
    })();
    inFlight.set(key, running);
    return running;
  };

  return {
    async sync(trip) {
      // Only legs without a route. A pending leg belongs to a request already
      // sent: the trip passed in may be older than that request's answer, so
      // asking again would duplicate it. (Undo never brings back pending legs.)
      const requests = trip.legs.flatMap((leg, i) => (leg.route ? [] : [requestOf(trip, i)]));
      const waiting: Promise<void>[] = [];
      for (const request of requests) {
        const key = keyOf(request);
        const known = received.get(key);
        if (known) {
          dispatch({ type: "routeArrived", request, route: known });
        } else {
          dispatch({ type: "routeRequested", request });
          waiting.push(inFlight.get(key) ?? start(request));
        }
      }
      await Promise.all(waiting);
    },
  };
}
