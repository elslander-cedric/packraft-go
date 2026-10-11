import type { LatLng, LegMode } from "./trip";

/** A point on a routed leg, with its elevation in metres. */
export type RoutedPoint = LatLng & { readonly elevation: number };

/**
 * Why a leg could not be routed:
 * - `no-route`: the router found no trail or river between the points.
 * - `unavailable`: the routing service could not be reached or failed.
 */
export type RouteFailure = { readonly kind: "no-route" | "unavailable" };

export type RouteResult =
  | { readonly ok: true; readonly geometry: readonly RoutedPoint[] }
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
