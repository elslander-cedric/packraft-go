// Routing orchestration: decides which legs to route and stores the router's
// answers on them. The router is injected, so tests pass a fake (spec #2).
import type { LegRoute, RouteResult, Router } from "./router";
import type { LatLng, Leg, LegMode, Trip } from "./trip";

/** Applies a change to the planner's current trip (e.g. React's setState). */
export type TripUpdate = (change: (trip: Trip) => Trip) => void;

export type AutoRouter = {
  /**
   * Routes every leg of the trip that has no routed result yet. Resolves when
   * the routes it started have been stored.
   */
  sync(trip: Trip): Promise<void>;
};

type Request = { readonly mode: LegMode; readonly points: readonly [LatLng, LatLng] };

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
  result.ok ? { status: "routed", geometry: result.geometry } : { status: "failed", failure: result.failure };

/** Clears a failed leg's route so that the next sync routes it again. Other legs are left alone. */
export function retryLeg(trip: Trip, legIndex: number): Trip {
  if (trip.legs[legIndex]?.route?.status !== "failed") return trip;
  return { ...trip, legs: trip.legs.map((leg, i) => (i === legIndex ? { ...leg, route: undefined } : leg)) };
}

const keyOf = ({ mode, points: [from, to] }: Request) => `${mode}:${from.lat},${from.lng};${to.lat},${to.lng}`;

/** Legs that wait for a route: never routed, or pending (possibly brought back by undo). */
const awaitsRoute = (leg: Leg) => !leg.route || leg.route.status === "pending";

/**
 * Stores a route on every leg of the current trip that `request` is for and
 * that is still waiting for one. Legs that changed meanwhile are left alone.
 */
const store = (request: Request, route: LegRoute) => (current: Trip) =>
  setRoutes(
    current,
    route,
    // A leg already pending stays as it is, so marking legs pending twice does not change the trip.
    (leg, i) => awaitsRoute(leg) && leg.route?.status !== route.status && isFor(current, i, request),
  );

export function createAutoRouter(router: Router, update: TripUpdate): AutoRouter {
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
      update(store(request, route));
    })();
    inFlight.set(key, running);
    return running;
  };

  return {
    async sync(trip) {
      const requests = trip.legs.flatMap((leg, i) => (awaitsRoute(leg) ? [requestOf(trip, i)] : []));
      const waiting: Promise<void>[] = [];
      for (const request of requests) {
        const key = keyOf(request);
        const known = received.get(key);
        if (known) {
          update(store(request, known));
        } else {
          update(store(request, { status: "pending" }));
          waiting.push(inFlight.get(key) ?? start(request));
        }
      }
      await Promise.all(waiting);
    },
  };
}
