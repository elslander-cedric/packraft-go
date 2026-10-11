// Save format (spec #2, ADR 0011): the trip as versioned JSON, including
// routed results, so a restored trip needs no routing requests (ADR 0014).
import type { LegRoute, RoutedPoint } from "./router";
import { emptyTrip, type LatLng, type Leg, type LegMode, type Trip } from "./trip";

export const SAVE_FORMAT = "packraft-go-trip";
export const SAVE_VERSION = 1;

export type ParseResult = { readonly ok: true; readonly trip: Trip } | { readonly ok: false };

/**
 * What is saved of a leg's route: routed results (with the router's `climbM`
 * as it is) and failures. A pending leg is saved without a route: its request
 * dies with the page, so it is routed again after a restore.
 */
const savedRoute = (route: LegRoute | undefined): LegRoute | undefined =>
  route?.status === "pending" ? undefined : route;

const savedLeg = (leg: Leg): Leg => {
  const route = savedRoute(leg.route);
  return route ? { mode: leg.mode, route } : { mode: leg.mode };
};

/** The trip as save-file text. Undo history is not saved. */
export function serialiseTrip(trip: Trip): string {
  return JSON.stringify({
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    trip: { name: trip.name, points: trip.points, legs: trip.legs.map(savedLeg) },
  });
}

/**
 * Reads save-file text back into a trip. Anything that is not a valid save of
 * this version is rejected as a whole; fields the format does not know are
 * ignored. The restored trip has no undo history.
 */
export function parseTrip(text: string): ParseResult {
  try {
    const file = object(JSON.parse(text));
    if (file.format !== SAVE_FORMAT || file.version !== SAVE_VERSION) throw invalid;
    return { ok: true, trip: readTrip(object(file.trip)) };
  } catch {
    return { ok: false };
  }
}

/**
 * The trip to start with, from what browser storage holds: the stored trip,
 * or an empty trip when nothing is stored or it cannot be read.
 */
export function restoreTrip(stored: string | null): Trip {
  if (stored === null) return emptyTrip();
  const parsed = parseTrip(stored);
  return parsed.ok ? parsed.trip : emptyTrip();
}

// Readers below throw `invalid` on the first thing that does not fit; parseTrip catches it.
const invalid = new Error("invalid save file");

type Fields = Record<string, unknown>;

function object(value: unknown): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid;
  return value as Fields;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid;
  return value;
}

function number(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw invalid;
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw invalid;
  return value as T;
}

function readLatLng(value: unknown): LatLng {
  const point = object(value);
  return { lat: number(point.lat, -90, 90), lng: number(point.lng, -180, 180) };
}

function readRoutedPoint(value: unknown): RoutedPoint {
  return { ...readLatLng(value), elevation: number(object(value).elevation) };
}

function readRoute(value: unknown): LegRoute | undefined {
  if (value === undefined) return undefined;
  const route = object(value);
  const status = oneOf(route.status, ["routed", "failed", "pending"] as const);
  if (status === "pending") return undefined;
  if (status === "failed") {
    return { status, failure: { kind: oneOf(object(route.failure).kind, ["no-route", "unavailable"] as const) } };
  }
  const geometry = list(route.geometry).map(readRoutedPoint);
  return route.climbM === undefined ? { status, geometry } : { status, geometry, climbM: number(route.climbM) };
}

function readLeg(value: unknown): Leg {
  const leg = object(value);
  const mode = oneOf<LegMode>(leg.mode, ["hike", "paddle"]);
  const route = readRoute(leg.route);
  return route ? { mode, route } : { mode };
}

function readTrip(trip: Fields): Trip {
  if (typeof trip.name !== "string") throw invalid;
  const points = list(trip.points).map(readLatLng);
  const legs = list(trip.legs).map(readLeg);
  // legs[i] runs from points[i] to points[i + 1].
  if (legs.length !== Math.max(points.length - 1, 0)) throw invalid;
  return { name: trip.name, points, legs };
}
