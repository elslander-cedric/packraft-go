import { addDays, type CalendarDate } from "./calendarDate";
import type { LegRoute, RoutedPoint } from "./router";
import { defaultSettings, type Settings } from "./settings";
import type { LatLng, Leg, LegMode, Trip } from "./trip";

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
  /** Estimated time in hours (ADR 0009). An estimate, and shown as one; see `timeStatus`. */
  readonly timeH: number;
  readonly timeStatus: TimeStatus;
};

/**
 * How far a time can be trusted (ADR 0009, amended):
 * - `estimated`: the time rule had everything it needs.
 * - `pending`: a hike leg (or, for the trip, any leg) is still being routed;
 *   `timeH` is only a placeholder and is not shown.
 * - `no-climb-data`: a hike leg failed to route, so its time counts distance
 *   only; a trip including such a leg says so too.
 */
export type TimeStatus = "estimated" | "pending" | "no-climb-data";

/** A paddle leg ending up to this many metres higher than it starts is elevation noise, not a rise. */
export const RISE_NOISE_M = 2;

/**
 * Totals for one day (ADR 0008): the legs from the start or a camp to the next
 * camp or the end. Climb and descent come from hike legs only; paddle legs
 * have a drop instead (ADR 0018). A hike leg not routed yet adds no climb or
 * descent; its day's time status says so.
 */
export type DaySummary = {
  /** Index of the day's first leg. */
  readonly firstLeg: number;
  /** Index of the day's last leg. */
  readonly lastLeg: number;
  readonly hikeDistanceKm: number;
  readonly paddleDistanceKm: number;
  readonly climbM: number;
  readonly descentM: number;
  readonly timeH: number;
  /** Follows the trip total's rule (ADR 0009), over the day's legs only. */
  readonly timeStatus: TimeStatus;
  /** The day's calendar date, from the trip's start date; absent for an undated trip. */
  readonly date?: CalendarDate;
};

export type TripSummary = {
  readonly legs: readonly LegSummary[];
  /** The trip's days: one without camps, none without legs. Always derived, never stored. */
  readonly days: readonly DaySummary[];
  readonly trip: { readonly distanceKm: number; readonly timeH: number; readonly timeStatus: TimeStatus };
};

const EARTH_MEAN_RADIUS_KM = 6371.0088;

/** Great-circle distance between two points (haversine formula). */
export function distanceKm(a: LatLng, b: LatLng): number {
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

/** Naismith's rule: 5 km/h on the flat plus 1 h per 600 m of climb. */
const NAISMITH_FLAT_KMH = 5;
const NAISMITH_CLIMB_M_PER_H = 600;

/** Hike time in hours (ADR 0009): Naismith's rule scaled by the planner's pace factor. */
function hikeTimeH(km: number, climbM: number, settings: Settings): number {
  return (km / NAISMITH_FLAT_KMH + climbM / NAISMITH_CLIMB_M_PER_H) * settings.paceFactor;
}

/** Paddle time in hours (ADR 0009): distance at the planner's paddling speed. */
function paddleTimeH(km: number, settings: Settings): number {
  return km / settings.paddleSpeedKmh;
}

/**
 * Figures for each leg and the whole trip, with times from the planner's settings. Totals are always derived, never
 * stored (ADR 0008). Legs are measured as straight lines until they are routed.
 */
export function summarise(trip: Trip, settings: Settings = defaultSettings): TripSummary {
  const legs = trip.legs.map((leg, i): LegSummary => {
    if (leg.route?.status === "routed") {
      const km = pathKm(leg.route.geometry);
      if (leg.mode === "paddle") {
        const timeH = paddleTimeH(km, settings);
        return { mode: leg.mode, distanceKm: km, ...legDrop(leg.route), timeH, timeStatus: "estimated" };
      }
      const elevation = legClimbAndDescent(leg.route);
      const timeH = hikeTimeH(km, elevation.climbM, settings);
      return { mode: leg.mode, distanceKm: km, ...elevation, timeH, timeStatus: "estimated" };
    }
    // Not routed: a straight line. Paddle time does not need climb; hike time
    // waits for routing, or does without climb when routing failed.
    const km = distanceKm(trip.points[i], trip.points[i + 1]);
    if (leg.mode === "paddle") {
      return { mode: leg.mode, distanceKm: km, timeH: paddleTimeH(km, settings), timeStatus: "estimated" };
    }
    const timeStatus: TimeStatus = leg.route?.status === "failed" ? "no-climb-data" : "pending";
    return { mode: leg.mode, distanceKm: km, timeH: hikeTimeH(km, 0, settings), timeStatus };
  });
  const sum = (figure: (leg: LegSummary) => number) => legs.reduce((total, leg) => total + figure(leg), 0);
  return {
    legs,
    days: dayRanges(trip).map(([first, last], day) => {
      const summary = summariseDay(trip, legs, first, last);
      // Day n (counted from 1) falls on the start date + n - 1.
      return trip.startDate === undefined ? summary : { ...summary, date: addDays(trip.startDate, day) };
    }),
    trip: {
      distanceKm: sum((leg) => leg.distanceKm),
      timeH: sum((leg) => leg.timeH),
      timeStatus: timeStatusOf(trip.legs, legs),
    },
  };
}

/**
 * First and last leg index of each day. A camp at point i ends a day after
 * leg i - 1; camps at the start or end point split nothing.
 */
export function dayRanges(trip: Trip): [number, number][] {
  if (trip.legs.length === 0) return [];
  const ranges: [number, number][] = [];
  let first = 0;
  for (const camp of trip.camps ?? []) {
    if (camp <= first || camp >= trip.legs.length) continue;
    ranges.push([first, camp - 1]);
    first = camp;
  }
  ranges.push([first, trip.legs.length - 1]);
  return ranges;
}

function summariseDay(trip: Trip, legs: readonly LegSummary[], first: number, last: number): DaySummary {
  const dayLegs = legs.slice(first, last + 1);
  const sum = (figure: (leg: LegSummary) => number) => dayLegs.reduce((total, leg) => total + figure(leg), 0);
  return {
    firstLeg: first,
    lastLeg: last,
    hikeDistanceKm: sum((leg) => (leg.mode === "hike" ? leg.distanceKm : 0)),
    paddleDistanceKm: sum((leg) => (leg.mode === "paddle" ? leg.distanceKm : 0)),
    climbM: sum((leg) => leg.climbM ?? 0),
    descentM: sum((leg) => leg.descentM ?? 0),
    timeH: sum((leg) => leg.timeH),
    timeStatus: timeStatusOf(trip.legs.slice(first, last + 1), dayLegs),
  };
}

/**
 * A total's time (the trip's or a day's) waits while any of its legs is still
 * being routed, and lacks climb data when any of its legs' times does.
 */
function timeStatusOf(legs: readonly Leg[], summaries: readonly LegSummary[]): TimeStatus {
  if (legs.some((leg) => leg.route === undefined || leg.route.status === "pending")) return "pending";
  return summaries.some((leg) => leg.timeStatus === "no-climb-data") ? "no-climb-data" : "estimated";
}
