import type { LatLng, LegMode, Trip } from "./trip";

export type LegSummary = { readonly mode: LegMode; readonly distanceKm: number };

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

/**
 * Figures for each leg and the whole trip. Totals are always derived, never
 * stored (ADR 0008). Legs are measured as straight lines until they are routed.
 */
export function summarise(trip: Trip): TripSummary {
  const legs = trip.legs.map((leg, i) => ({
    mode: leg.mode,
    distanceKm: distanceKm(trip.points[i], trip.points[i + 1]),
  }));
  const total = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
  return { legs, trip: { distanceKm: total } };
}
