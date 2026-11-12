// Save format (ADR 0011): the trip as versioned JSON, including
// routed results, so a restored trip needs no routing requests (ADR 0014).
import { z } from "zod";
import { isCalendarDate } from "./calendarDate";
import { tripFileName } from "./fileName";
import type { LegRoute } from "./router";
import { emptyTrip, type Leg, type Trip } from "./trip";

export const SAVE_FORMAT = "packraft-go-trip";
/**
 * The save format's version (ADR 0011, amended): the only version the app
 * saves and the only one it opens. The format was reset for v2: version 1
 * holds camps and the optional start date. The earlier "version 2" format is
 * refused like any other version; there is no code to read older formats.
 */
export const SAVE_VERSION = 1;

/**
 * A save that cannot be opened is either damaged or not a trip (no reason), or
 * a packraft-go trip of a version this app does not know, e.g. from a newer app
 * (`unknown-version`), so the planner can be told which.
 */
export type ParseResult =
  { readonly ok: true; readonly trip: Trip } | { readonly ok: false; readonly reason?: "unknown-version" };

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
 * not saved. `camps` (point indices) is only written when the trip has camps,
 * `startDate` ("YYYY-MM-DD") only when the trip has one.
 */
export function serialiseTrip(trip: Trip): string {
  const camps = trip.camps?.length ? { camps: trip.camps } : {};
  const startDate = trip.startDate === undefined ? {} : { startDate: trip.startDate };
  return JSON.stringify({
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    trip: { name: trip.name, points: trip.points, legs: trip.legs.map(savedLeg), ...camps, ...startDate },
  });
}

/** Ending of a save file's name, so trip files are recognisable among downloads. */
export const SAVE_FILE_EXTENSION = ".packraft.json";

/** The save file's name: the trip's name, or `untitledName` for a trip without one. */
export function saveFileName(trip: Trip, untitledName: string): string {
  return tripFileName(trip, untitledName, SAVE_FILE_EXTENSION);
}

/**
 * Reads save-file text back into a trip. Only the current version is read; a
 * trip file with any other numbered version is refused as an unknown version.
 * Anything that is not a valid save is rejected as a whole; fields the format
 * does not know are ignored. The restored trip has no undo history.
 */
export function parseTrip(text: string): ParseResult {
  const file = fileSchema.safeParse(parseJson(text));
  if (!file.success) {
    return { ok: false };
  }
  if (file.data.version !== SAVE_VERSION) {
    return { ok: false, reason: "unknown-version" };
  }
  const trip = tripSchema.safeParse(file.data.trip);
  return trip.success ? { ok: true, trip: trip.data } : { ok: false };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The trip to start with, from what browser storage holds: the stored trip,
 * or an empty trip when nothing is stored or it cannot be read.
 */
export function restoreTrip(stored: string | null): Trip {
  return restoreStoredTrip(stored).trip;
}

/**
 * The trip to start with, and whether browser storage holds a save from a
 * newer or unknown version. Such a save is not discarded: the planner
 * keeps it in storage and warns, since a newer deployment may be able to read
 * it. Corrupt data is not flagged; it just gives an empty trip.
 */
export type StoredTrip = { readonly trip: Trip; readonly unknownVersion: boolean };

export function restoreStoredTrip(stored: string | null): StoredTrip {
  const parsed = stored === null ? null : parseTrip(stored);
  if (parsed?.ok) {
    return { trip: parsed.trip, unknownVersion: false };
  }
  return { trip: emptyTrip(), unknownVersion: parsed?.reason === "unknown-version" };
}

const fileSchema = z.object({ format: z.literal(SAVE_FORMAT), version: z.number(), trip: z.unknown() });

const latLngSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const routeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("routed"),
    geometry: z.array(latLngSchema.extend({ elevation: z.number() })),
    climbM: z.number().optional(),
  }),
  z.object({ status: z.literal("failed"), failure: z.object({ kind: z.enum(["no-route", "unavailable"]) }) }),
  z.object({ status: z.literal("pending") }),
]);

const legSchema = z
  .object({ mode: z.enum(["hike", "paddle"]), route: routeSchema.optional() })
  .transform(({ mode, route }): Leg => savedLeg({ mode, route }));

const tripSchema = z
  .object({
    name: z.string(),
    points: z.array(latLngSchema),
    legs: z.array(legSchema),
    /** Indices of existing points, each at most once. Absent: no camps. */
    camps: z.array(z.int().min(0)).default([]),
    /** Absent: the trip is undated. */
    startDate: z.string().refine(isCalendarDate).optional(),
  })
  // legs[i] runs from points[i] to points[i + 1].
  .refine((trip) => trip.legs.length === Math.max(trip.points.length - 1, 0))
  .refine((trip) => trip.camps.every((camp) => camp < trip.points.length))
  .refine((trip) => new Set(trip.camps).size === trip.camps.length)
  .transform(({ camps, startDate, ...trip }): Trip => ({
    ...trip,
    ...(camps.length > 0 ? { camps: camps.toSorted((left, right) => left - right) } : {}),
    ...(startDate === undefined ? {} : { startDate }),
  }));
