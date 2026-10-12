// Save format (spec #2, ADR 0011): the trip as versioned JSON, including
// routed results, so a restored trip needs no routing requests (ADR 0014).
import { tripFileName } from "./fileName";
import type { LegRoute, RoutedPoint } from "./router";
import { emptyTrip, type LatLng, type Leg, type LegMode, type Trip } from "./trip";

export const SAVE_FORMAT = "packraft-go-trip";
/**
 * The version the app saves (ADR 0011, amended). Version 2 added camps (#8);
 * version 1 saves, from before camps, still load as trips without camps.
 */
export const SAVE_VERSION = 2;
const READABLE_VERSIONS: readonly unknown[] = [1, 2];

/**
 * A save that cannot be opened is either damaged or not a trip (no reason), or
 * a packraft-go trip of a version this app does not know, e.g. from a newer app
 * (`unknown-version`), so the planner can be told which.
 */
export type ParseResult =
  | { readonly ok: true; readonly trip: Trip }
  | { readonly ok: false; readonly reason?: "unknown-version" };

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

/**
 * The trip as save-file text, always in the current version. Undo history is
 * not saved. `camps` (point indices) is only written when the trip has camps.
 */
export function serialiseTrip(trip: Trip): string {
  const camps = trip.camps?.length ? { camps: trip.camps } : {};
  return JSON.stringify({
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    trip: { name: trip.name, points: trip.points, legs: trip.legs.map(savedLeg), ...camps },
  });
}

/** Ending of a save file's name, so trip files are recognisable among downloads. */
export const SAVE_FILE_EXTENSION = ".packraft.json";

/** The save file's name: the trip's name, or `untitledName` for a trip without one. */
export function saveFileName(trip: Trip, untitledName: string): string {
  return tripFileName(trip, untitledName, SAVE_FILE_EXTENSION);
}

/**
 * Reads save-file text back into a trip. Versions 1 and 2 are read; a trip
 * file with any other numbered version is refused as an unknown version.
 * Anything that is not a valid save is rejected as a whole; fields the format
 * does not know are ignored. The restored trip has no undo history.
 */
export function parseTrip(text: string): ParseResult {
  try {
    const file = object(JSON.parse(text));
    if (file.format !== SAVE_FORMAT || typeof file.version !== "number") throw invalid;
    if (!READABLE_VERSIONS.includes(file.version)) return { ok: false, reason: "unknown-version" };
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
  // Without a camps list the trip has no camps: always so in version 1, which
  // came before camps. A camps list in a version 1 save (only pre-release
  // builds wrote one) is checked like any other, not trusted.
  const camps = readCamps(trip.camps, points.length);
  return camps.length > 0 ? { name: trip.name, points, legs, camps } : { name: trip.name, points, legs };
}

/** Camps as distinct indices of existing points, in ascending order; none when the field is absent. */
function readCamps(value: unknown, pointCount: number): number[] {
  if (value === undefined) return [];
  const camps = list(value).map((camp) => {
    if (!Number.isInteger(camp)) throw invalid;
    return number(camp, 0, pointCount - 1);
  });
  if (new Set(camps).size !== camps.length) throw invalid;
  return camps.sort((a, b) => a - b);
}
