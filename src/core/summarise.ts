import type { LegRoute, RoutedPoint } from "./router";
import type { LatLng, LegMode, Trip } from "./trip";

/**
 * Figures for one leg. Hike legs have climb and descent (metres); paddle legs
 * have a drop instead (ADR 0018). They come from the routed geometry's
 * elevations, so they are absent until the leg is routed.
 */
export type LegSummary = {
  readonly mode: LegMode;
  readonly distanceKm: number;
  readonly climbM?: number;
  readonly descentM?: number;
  /**
   * Put-in elevation minus take-out elevation. A paddle leg that ends at most
   * RISE_NOISE_M higher (rounded to whole metres) has a drop of 0 (elevation
   * noise, ADR 0018).
   */
  readonly dropM?: number;
  /**
   * How much higher a paddle leg ends than it starts, when that is more than
   * RISE_NOISE_M once rounded to whole metres: a hint that it may be drawn
   * upstream. Replaces the drop.
   */
  readonly riseM?: number;
};

/** A paddle leg ending up to this many metres higher than it starts is elevation noise, not a rise. */
export const RISE_NOISE_M = 2;

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

/**
 * Elevation smoothing buffer in metres. BRouter smooths its climb ("filtered
 * ascend") the same way; 5 m reproduces its figure on recorded tracks.
 */
const ELEVATION_BUFFER_M = 5;

/**
 * Climb and descent along the path in metres, smoothed so elevation noise does
 * not add up: changes accumulate in a buffer, and only the part of a sustained
 * rise (or fall) beyond the first ELEVATION_BUFFER_M metres counts. Wiggles
 * smaller than the buffer count for nothing.
 */
function smoothedClimbAndDescent(points: readonly RoutedPoint[]) {
  let climbM = 0;
  let descentM = 0;
  let rising = 0; // metres risen since the last low, capped at the buffer
  let falling = 0; // metres fallen since the last high, capped at the buffer
  for (let i = 1; i < points.length; i++) {
    const change = points[i].elevation - points[i - 1].elevation;
    rising = Math.max(0, rising + change);
    falling = Math.max(0, falling - change);
    if (rising > ELEVATION_BUFFER_M) {
      climbM += rising - ELEVATION_BUFFER_M;
      rising = ELEVATION_BUFFER_M;
    }
    if (falling > ELEVATION_BUFFER_M) {
      descentM += falling - ELEVATION_BUFFER_M;
      falling = ELEVATION_BUFFER_M;
    }
  }
  return { climbM, descentM };
}

/** Climb and descent of a routed leg: the router's own smoothed climb when it gives one. */
function legClimbAndDescent(route: Extract<LegRoute, { status: "routed" }>) {
  const smoothed = smoothedClimbAndDescent(route.geometry);
  return { climbM: route.climbM ?? smoothed.climbM, descentM: smoothed.descentM };
}

/**
 * Drop of a routed paddle leg: from its per-point elevations, not the router's
 * climb (ADR 0018). A small rise counts as no drop; a larger one is a rise.
 */
function legDrop(route: Extract<LegRoute, { status: "routed" }>): { dropM: number } | { riseM: number } {
  const { geometry } = route;
  const dropM = geometry[0].elevation - geometry[geometry.length - 1].elevation;
  if (dropM >= 0) return { dropM };
  // Rounded to whole metres first, as it is shown, so a rise shown as 2 m is noise too.
  return Math.round(-dropM) > RISE_NOISE_M ? { riseM: -dropM } : { dropM: 0 };
}

/**
 * Figures for each leg and the whole trip. Totals are always derived, never
 * stored (ADR 0008). Legs are measured as straight lines until they are routed.
 */
export function summarise(trip: Trip): TripSummary {
  const legs = trip.legs.map((leg, i): LegSummary => {
    if (leg.route?.status === "routed") {
      const elevation = leg.mode === "paddle" ? legDrop(leg.route) : legClimbAndDescent(leg.route);
      return { mode: leg.mode, distanceKm: pathKm(leg.route.geometry), ...elevation };
    }
    return { mode: leg.mode, distanceKm: distanceKm(trip.points[i], trip.points[i + 1]) };
  });
  const total = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
  return { legs, trip: { distanceKm: total } };
}
