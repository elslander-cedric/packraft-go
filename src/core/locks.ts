// Lock warnings on paddle legs (#60, GLOSSARY: Lock). A paddle leg whose line
// passes a lock must portage there. Information only: it never blocks.
import type { LockMarker } from "./access";
import type { CalendarDate } from "./calendarDate";
import { distanceToLineM } from "./geo";
import type { LatLng } from "./trip";

/**
 * How far from a lock the leg's line may pass and still count as passing it.
 * A routed line follows the waterway and a lock's mapped position is its middle,
 * while the lock itself is up to a few hundred metres long.
 */
export const LOCK_TOLERANCE_M = 100;

/** Locks of the same name closer than this are one lock complex (e.g. two chambers side by side): warned once. */
const SAME_COMPLEX_M = 400;

/** "Lock at X: portage required", for one lock a paddle leg passes. */
export type LockWarning = {
  readonly lock: LockMarker;
  readonly leg: number;
  /** Index of the leg's day, counted from 0. */
  readonly day: number;
  readonly date?: CalendarDate;
};

/** The locks a leg's line passes within `LOCK_TOLERANCE_M`, in the order they are given; a lock complex counts once. */
export function locksOnLine(line: readonly LatLng[], locks: readonly LockMarker[]): LockMarker[] {
  const coordinates = line.map((p) => [p.lng, p.lat] as [number, number]);
  const found: LockMarker[] = [];
  for (const lock of locks) {
    const at = { lat: lock.position[1], lng: lock.position[0] };
    if (distanceToLineM(at, coordinates) > LOCK_TOLERANCE_M) continue;
    const sameComplex = found.some(
      (other) => other.name === lock.name && distanceToLineM(at, [other.position]) <= SAME_COMPLEX_M,
    );
    if (!sameComplex) found.push(lock);
  }
  return found;
}
