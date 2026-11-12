// Access points (ADR 0023, GLOSSARY "Access point"): places you've marked
// where you can get onto or off the water. They are your own collection,
// separate from trips, so every trip can use them. Pure: ids and times are
// passed in by the caller.
import { z } from "zod";
import { isCalendarDate, type CalendarDate } from "./calendarDate";
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
 * Where an access point's name came from (ADR 0027, GLOSSARY "Default name"):
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
export type AccessPointChanges = Partial<
  Pick<AccessPoint, "position" | "name" | "use" | "kind" | "note" | "checkedOnSite">
>;

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
  if (index < 0) {
    return points;
  }
  const { checkedOnSite } = changes;
  if (checkedOnSite !== undefined && checkedOnSite !== null && !isCalendarDate(checkedOnSite)) {
    return points;
  }
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
  if (index < 0) {
    return points;
  }
  const point = points[index];
  if (point.nameSource !== "to-look-up" || point.position.lat !== at.lat || point.position.lng !== at.lng) {
    return points;
  }
  return points.with(index, { ...point, name, nameSource: "default" });
}

/** The collection without the point `id` (unchanged when there is no such point). */
export function deleteAccessPoint(points: AccessPoints, id: string): AccessPoints {
  return points.some((point) => point.id === id) ? points.filter((point) => point.id !== id) : points;
}

export const ACCESS_POINTS_FORMAT = "packraft-go-access-points";
/**
 * The access points format's version: its own, separate from the trip save
 * format (ADR 0023). The only version the app writes and reads.
 */
export const ACCESS_POINTS_VERSION = 1;

/**
 * Access points that cannot be read are damaged or not access points (no
 * reason), or from a version this app does not know (`unknown-version`).
 */
export type AccessPointsParseResult =
  | { readonly ok: true; readonly accessPoints: AccessPoints }
  | { readonly ok: false; readonly reason?: "unknown-version" };

/** The access points as text, for browser storage. */
export function serialiseAccessPoints(points: AccessPoints): string {
  return JSON.stringify({ format: ACCESS_POINTS_FORMAT, version: ACCESS_POINTS_VERSION, accessPoints: points });
}

/**
 * Reads access points back from their text. A file is accepted or refused as a
 * whole; fields the format does not know are ignored. Names came later in
 * version 1: a point without one reads as unnamed, with its default
 * name to look up, and a name without its source as one you typed.
 */
export function parseAccessPoints(text: string): AccessPointsParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const file = fileSchema.safeParse(json);
  if (!file.success) {
    return { ok: false };
  }
  if (file.data.version !== ACCESS_POINTS_VERSION) {
    return { ok: false, reason: "unknown-version" };
  }
  const accessPoints = accessPointsSchema.safeParse(file.data.accessPoints);
  return accessPoints.success ? { ok: true, accessPoints: accessPoints.data } : { ok: false };
}

/**
 * The access points to start with, from browser storage, and what was wrong
 * with the save when it could not be read:
 * - `unknownVersion`: it is from an unknown version. Keep it, don't overwrite
 *   it, since a newer deployment may be able to read it.
 * - `damaged`: it is damaged or not access points. Back it up before it is
 *   replaced: it may still hold points worth recovering.
 * Either way the collection starts empty.
 */
export type StoredAccessPoints = {
  readonly accessPoints: AccessPoints;
  readonly unknownVersion: boolean;
  readonly damaged: boolean;
};

export function restoreStoredAccessPoints(stored: string | null): StoredAccessPoints {
  const parsed = stored === null ? null : parseAccessPoints(stored);
  if (parsed === null) {
    return { accessPoints: [], unknownVersion: false, damaged: false };
  }
  if (parsed.ok) {
    return { accessPoints: parsed.accessPoints, unknownVersion: false, damaged: false };
  }
  const unknownVersion = parsed.reason === "unknown-version";
  return { accessPoints: [], unknownVersion, damaged: !unknownVersion };
}

const fileSchema = z.object({
  format: z.literal(ACCESS_POINTS_FORMAT),
  version: z.number(),
  accessPoints: z.unknown(),
});

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const accessPointSchema = z
  .object({
    id: z.string().min(1),
    position: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    // The name fields are optional in the format.
    name: z.string().default(""),
    nameSource: z.enum(nameSources).default("typed"),
    use: z.enum(accessPointUses),
    kind: z.enum(accessPointKinds),
    note: z.string(),
    checkedOnSite: z.string().refine(isCalendarDate).nullable().default(null),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .transform((point): AccessPoint => {
    // A point without a name gets its default name looked up.
    const unnamed = point.name.trim() === "" && point.nameSource !== "default";
    return unnamed ? { ...point, name: "", nameSource: "to-look-up" } : point;
  });

const accessPointsSchema = z
  .array(accessPointSchema)
  .refine((points) => new Set(points.map((point) => point.id)).size === points.length);
