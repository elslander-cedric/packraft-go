import type { RoutedPoint } from "./router";
import type { LatLng, LegMode, Trip } from "./trip";

/**
 * Figures for one leg. Climb and descent (metres) come from the routed
 * geometry's elevations, so they are absent until the leg is routed.
 */
export type LegSummary = {
  readonly mode: LegMode;
  readonly distanceKm: number;
  readonly climbM?: number;
  readonly descentM?: number;
};

export type TripSummary = {
  readonly legs: readonly LegSummary[];
  readonly trip: { readonly distanceKm: number };
};

const EARTH_MEAN_RADIUS_KM = 6371.0088;

/** Great-circle distance between two points (haversine formula). */
function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a path through the points, in kilometres. */
function pathKm(points: readonly LatLng[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1], points[i]);
  return km;
}

/** Sums of every rise and every fall along the path, in metres. */
function climbAndDescent(points: readonly RoutedPoint[]) {
  let climbM = 0;
  let descentM = 0;
  for (let i = 1; i < points.length; i++) {
    const change = points[i].elevation - points[i - 1].elevation;
    if (change > 0) climbM += change;
    else descentM -= change;
  }
  return { climbM, descentM };
}

/**
 * Figures for each leg and the whole trip. Totals are always derived, never
 * stored (ADR 0008). Legs are measured as straight lines until they are routed.
 */
export function summarise(trip: Trip): TripSummary {
  const legs = trip.legs.map((leg, i): LegSummary => {
    if (leg.route?.status === "routed") {
      return { mode: leg.mode, distanceKm: pathKm(leg.route.geometry), ...climbAndDescent(leg.route.geometry) };
    }
    return { mode: leg.mode, distanceKm: distanceKm(trip.points[i], trip.points[i + 1]) };
  });
  const total = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
  return { legs, trip: { distanceKm: total } };
}
