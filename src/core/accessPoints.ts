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

/**
 * Where an access point's name came from (#136, ADR 0027, GLOSSARY "Default name"):
 * - `typed`: you typed it; it is never changed automatically.
 * - `default`: the default name found for the point's position, "" when
 *   nothing was found there. Cleared and looked up again when the point moves.
 * - `to-look-up`: a default name still to be looked up (new, moved, cleared,
 *   or imported without a name). Until then the name is "".
 */
export type NameSource = "typed" | "default" | "to-look-up";
export const nameSources: readonly NameSource[] = ["typed", "default", "to-look-up"];

export type AccessPoint = {
  readonly id: string;
  readonly position: LatLng;
  /** Its name, e.g. "Hotton bridge" or "Rue du Moulin, Hotton"; "" for none. Not necessarily unique. */
  readonly name: string;
  readonly nameSource: NameSource;
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

/**
 * A new access point at `at`: usable both ways, an informal bank, no note, not
 * checked, and no name until its default name is found.
 */
export function addAccessPoint(
  points: AccessPoints,
  { id, at, now }: { id: string; at: LatLng; now: Timestamp },
): AccessPoints {
  const point: AccessPoint = {
    id,
    position: at,
    name: "",
    nameSource: "to-look-up",
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
export type AccessPointChanges = Partial<Pick<AccessPoint, "position" | "name" | "use" | "kind" | "note" | "checkedOnSite">>;

/**
 * The collection with one point edited and its updated time set to `now`.
 * An unknown id, or an impossible checked date, changes nothing.
 * A name is yours once you type it; clearing it (or leaving only spaces) asks
 * for the default name again. Moving a point with a default name clears it and
 * asks for a new one (ADR 0027).
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
  const point = points[index];
  let { name, nameSource } = point;
  if (changes.name !== undefined) {
    const cleared = changes.name.trim() === "";
    name = cleared ? "" : changes.name;
    nameSource = cleared ? "to-look-up" : "typed";
  } else if (changes.position !== undefined && nameSource !== "typed") {
    name = "";
    nameSource = "to-look-up";
  }
  return points.with(index, { ...point, ...changes, name, nameSource, updatedAt: now });
}

/**
 * What a default name lookup gave: the name, "" when nothing was found there,
 * or `failed` when the service couldn't be reached or answered with an error
 * (then ask again later).
 */
export type DefaultNameLookup = { readonly status: "found"; readonly name: string } | { readonly status: "failed" };

/**
 * Looks up the default name at a position (ADR 0027): the nearest road and
 * place. The real implementation (the Nominatim adapter) is injected; tests
 * pass a fake. Implementations never throw: a failure is a `failed` result.
 */
export interface DefaultNameSource {
  defaultNameAt(at: LatLng): Promise<DefaultNameLookup>;
}

/** The points whose default name is still to be looked up, in order. */
export function toLookUp(points: AccessPoints): AccessPoints {
  return points.filter((point) => point.nameSource === "to-look-up");
}

/**
 * The collection with the default name found at `at` given to point `id` ("" when
 * nothing was found there). Ignored, changing nothing, unless that point is
 * still waiting for a default name at that position: it may have moved, or
 * you may have typed a name, while the name was looked up. Not an edit of
 * yours, so its updated time stays.
 */
export function applyDefaultName(
  points: AccessPoints,
  id: string,
  { at, name }: { at: LatLng; name: string },
): AccessPoints {
  const index = points.findIndex((point) => point.id === id);
  if (index < 0) return points;
  const point = points[index];
  if (point.nameSource !== "to-look-up" || point.position.lat !== at.lat || point.position.lng !== at.lng) return points;
  return points.with(index, { ...point, name, nameSource: "default" });
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

// Default names come from the position, and change when OpenStreetMap does: only typed names count.
const typedName = (point: AccessPoint) => (point.nameSource === "typed" ? point.name : "");

const samePoint = (a: AccessPoint, b: AccessPoint) =>
  typedName(a) === typedName(b) &&
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
 * whole; fields the format does not know are ignored. Names came later in
 * version 1 (#136): a point without one reads as unnamed, with its default
 * name to look up, and a name without its source as one you typed.
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
 * The access points to start with, from browser storage, and what was wrong
 * with the save when it could not be read:
 * - `unknownVersion`: it is from an unknown version. Keep it, don't overwrite
 *   it, since a newer deployment may be able to read it.
 * - `damaged`: it is damaged or not access points. Back it up before it is
 *   replaced (round 2 of #55): it may still hold points worth recovering.
 * Either way the collection starts empty.
 */
export type StoredAccessPoints = {
  readonly accessPoints: AccessPoints;
  readonly unknownVersion: boolean;
  readonly damaged: boolean;
};

export function restoreStoredAccessPoints(stored: string | null): StoredAccessPoints {
  const parsed = stored === null ? null : parseAccessPoints(stored);
  if (parsed === null) return { accessPoints: [], unknownVersion: false, damaged: false };
  if (parsed.ok) return { accessPoints: parsed.accessPoints, unknownVersion: false, damaged: false };
  const unknownVersion = parsed.reason === "unknown-version";
  return { accessPoints: [], unknownVersion, damaged: !unknownVersion };
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
  const name = text(point.name ?? "");
  const source = point.nameSource === undefined ? "typed" : oneOf(point.nameSource, nameSources);
  const unnamed = name.trim() === "" && source !== "default";
  return {
    id,
    position: { lat: number(position.lat, -90, 90), lng: number(position.lng, -180, 180) },
    name: unnamed ? "" : name,
    nameSource: unnamed ? "to-look-up" : source,
    use: oneOf(point.use, accessPointUses),
    kind: oneOf(point.kind, accessPointKinds),
    note: text(point.note),
    checkedOnSite,
    createdAt: timestamp(point.createdAt),
    updatedAt: timestamp(point.updatedAt),
  };
}
