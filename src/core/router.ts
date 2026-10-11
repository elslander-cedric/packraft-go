import type { LatLng, LegMode } from "./trip";

/** A point on a routed leg, with its elevation in metres. */
export type RoutedPoint = LatLng & { readonly elevation: number };

/**
 * Why a leg could not be routed:
 * - `no-route`: the router found no trail or river between the points.
 * - `unavailable`: the routing service could not be reached or failed.
 */
export type RouteFailure = { readonly kind: "no-route" | "unavailable" };

/** Where a leg is in routing, stored on the leg (see `Leg.route`). */
export type LegRoute =
  | { readonly status: "pending" }
  | { readonly status: "routed"; readonly geometry: readonly RoutedPoint[]; readonly climbM?: number }
  | { readonly status: "failed"; readonly failure: RouteFailure };

export type RouteResult =
  /** `climbM`: the router's own smoothed climb in metres, when it reports one. */
  | { readonly ok: true; readonly geometry: readonly RoutedPoint[]; readonly climbM?: number }
  | { readonly ok: false; readonly failure: RouteFailure };

/**
 * Routes a leg of mode M through these points: geometry with elevations, or a
 * typed failure. Implementations never throw; failures are results. The real
 * implementation (BRouter adapter) is injected where routing is orchestrated,
 * so tests can pass a fake.
 */
export interface Router {
  route(mode: LegMode, points: readonly LatLng[]): Promise<RouteResult>;
}
