// Access points (#55, ADR 0023, GLOSSARY "Access point"): places you've marked
// where you can get onto or off the water. They are your own collection,
// separate from trips, so every trip can use them. Pure: ids and times are
// passed in by the caller.
import { isCalendarDate, type CalendarDate } from "./calendarDate";
import { distanceKm } from "./summarise";
import type { LatLng } from "./trip";

/** Whether you get onto the water here, off it, or both. */
export type AccessPointUse = "put-in" | "take-out" | "both";
export const accessPointUses: readonly AccessPointUse[] = ["put-in", "take-out", "both"];

/** What kind of place it is (GLOSSARY "Aire" for official aires). */
export type AccessPointKind = "official-aire" | "slipway" | "jetty" | "informal-bank";
export const accessPointKinds: readonly AccessPointKind[] = ["official-aire", "slipway", "jetty", "informal-bank"];

/** An ISO timestamp, e.g. "2026-10-13T08:00:00.000Z". */
export type Timestamp = string;

export type AccessPoint = {
  readonly id: string;
  readonly position: LatLng;
  readonly use: AccessPointUse;
  readonly kind: AccessPointKind;
  /** A short free-text note, e.g. "steep bank, park at the church"; "" for none. */
  readonly note: string;
  /** The date it was checked on site, or null when it hasn't been. */
  readonly checkedOnSite: CalendarDate | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
};

/** Your access points, in the order they were added. */
export type AccessPoints = readonly AccessPoint[];

/** A new access point at `at`: usable both ways, an informal bank, no note, not checked. */
export function addAccessPoint(
  points: AccessPoints,
  { id, at, now }: { id: string; at: LatLng; now: Timestamp },
): AccessPoints {
  const point: AccessPoint = {
    id,
    position: at,
    use: "both",
    kind: "informal-bank",
    note: "",
    checkedOnSite: null,
    createdAt: now,
    updatedAt: now,
  };
  return [...points, point];
}

/** What an edit can change about an access point. */
export type AccessPointChanges = Partial<Pick<AccessPoint, "position" | "use" | "kind" | "note" | "checkedOnSite">>;

/**
 * The collection with one point edited and its updated time set to `now`.
 * An unknown id, or an impossible checked date, changes nothing.
 */
export function updateAccessPoint(
  points: AccessPoints,
  id: string,
  changes: AccessPointChanges,
  now: Timestamp,
): AccessPoints {
  const index = points.findIndex((point) => point.id === id);
  if (index < 0) return points;
  const { checkedOnSite } = changes;
  if (checkedOnSite !== undefined && checkedOnSite !== null && !isCalendarDate(checkedOnSite)) return points;
  return points.with(index, { ...points[index], ...changes, updatedAt: now });
}

/** The collection without the point `id` (unchanged when there is no such point). */
export function deleteAccessPoint(points: AccessPoints, id: string): AccessPoints {
  return points.some((point) => point.id === id) ? points.filter((point) => point.id !== id) : points;
}

/**
 * Imported points closer than this to one of yours, with all the same fields,
 * are the same point: positions marked by GPS or by hand differ a little.
 */
export const DUPLICATE_DISTANCE_M = 5;

const samePoint = (a: AccessPoint, b: AccessPoint) =>
  a.use === b.use &&
  a.kind === b.kind &&
  a.note === b.note &&
  a.checkedOnSite === b.checkedOnSite &&
  distanceKm(a.position, b.position) * 1000 <= DUPLICATE_DISTANCE_M;

/** Your access points after an import, and how many imported points were new or already there. */
export type MergedAccessPoints = {
  readonly accessPoints: AccessPoints;
  readonly added: number;
  readonly alreadyThere: number;
};

/**
 * Merges imported access points into yours (ADR 0023: a friend's file, or your
 * own from another device). Yours are kept as they are; each imported point is
 * added after them unless an identical one is already there (same fields,
 * within a few metres; ids and timestamps aside). An added point whose id is
 * already taken gets a new one from `newId`.
 */
export function mergeAccessPoints(
  yours: AccessPoints,
  imported: AccessPoints,
  newId: () => string,
): MergedAccessPoints {
  const merged = [...yours];
  let added = 0;
  for (const point of imported) {
    if (merged.some((existing) => samePoint(existing, point))) continue;
    const idTaken = merged.some((existing) => existing.id === point.id);
    merged.push(idTaken ? { ...point, id: newId() } : point);
    added++;
  }
  return { accessPoints: merged, added, alreadyThere: imported.length - added };
}

export const ACCESS_POINTS_FORMAT = "packraft-go-access-points";
/**
 * The access points format's version: its own, separate from the trip save
 * format (ADR 0023). The only version the app writes and reads.
 */
export const ACCESS_POINTS_VERSION = 1;

/** The export file's name. The trip save files end in ".packraft.json"; this one is told apart by its name. */
export const ACCESS_POINTS_FILE_NAME = "packraft-go-access-points.json";

/**
 * Access points that cannot be read are damaged or not access points (no
 * reason), or from a version this app does not know (`unknown-version`).
 */
export type AccessPointsParseResult =
  | { readonly ok: true; readonly accessPoints: AccessPoints }
  | { readonly ok: false; readonly reason?: "unknown-version" };

/** The access points as text, for browser storage and for the export file. */
export function serialiseAccessPoints(points: AccessPoints): string {
  return JSON.stringify({ format: ACCESS_POINTS_FORMAT, version: ACCESS_POINTS_VERSION, accessPoints: points });
}

/**
 * Reads access points back from their text. A file is accepted or refused as a
 * whole; fields the format does not know are ignored.
 */
export function parseAccessPoints(text: string): AccessPointsParseResult {
  try {
    const file = object(JSON.parse(text));
    if (file.format !== ACCESS_POINTS_FORMAT || typeof file.version !== "number") throw invalid;
    if (file.version !== ACCESS_POINTS_VERSION) return { ok: false, reason: "unknown-version" };
    const accessPoints = list(file.accessPoints).map(readAccessPoint);
    if (new Set(accessPoints.map((point) => point.id)).size !== accessPoints.length) throw invalid;
    return { ok: true, accessPoints };
  } catch {
    return { ok: false };
  }
}

/**
 * The access points to start with, from browser storage, and whether storage
 * holds a save from an unknown version. Such a save should be kept, not
 * overwritten, since a newer deployment may be able to read it. Anything
 * unreadable gives no access points.
 */
export type StoredAccessPoints = { readonly accessPoints: AccessPoints; readonly unknownVersion: boolean };

export function restoreStoredAccessPoints(stored: string | null): StoredAccessPoints {
  const parsed = stored === null ? null : parseAccessPoints(stored);
  if (parsed?.ok) return { accessPoints: parsed.accessPoints, unknownVersion: false };
  return { accessPoints: [], unknownVersion: parsed?.reason === "unknown-version" };
}

// Readers below throw `invalid` on the first thing that does not fit; parseAccessPoints catches it.
const invalid = new Error("invalid access points");

type Fields = Record<string, unknown>;

function object(value: unknown): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid;
  return value as Fields;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid;
  return value;
}

function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw invalid;
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw invalid;
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw invalid;
  return value as T;
}

function timestamp(value: unknown): Timestamp {
  if (Number.isNaN(Date.parse(text(value)))) throw invalid;
  return value as Timestamp;
}

function readAccessPoint(value: unknown): AccessPoint {
  const point = object(value);
  const position = object(point.position);
  const id = text(point.id);
  if (id === "") throw invalid;
  const checkedOnSite = point.checkedOnSite ?? null;
  if (checkedOnSite !== null && !isCalendarDate(checkedOnSite)) throw invalid;
  return {
    id,
    position: { lat: number(position.lat, -90, 90), lng: number(position.lng, -180, 180) },
    use: oneOf(point.use, accessPointUses),
    kind: oneOf(point.kind, accessPointKinds),
    note: text(point.note),
    checkedOnSite,
    createdAt: timestamp(point.createdAt),
    updatedAt: timestamp(point.updatedAt),
  };
}
