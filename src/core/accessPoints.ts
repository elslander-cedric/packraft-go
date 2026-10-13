// Access points (#55, ADR 0023, GLOSSARY "Access point"): places you've marked
// where you can get onto or off the water. They are your own collection,
// separate from trips, so every trip can use them. Pure: ids and times are
// passed in by the caller.
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
