// Snapping a put-in or take-out to one of your access points (#62, ADR 0023,
// GLOSSARY "Access point"). Pure: the planner offers, and only an accepted
// offer changes the trip, as an ordinary undoable move.
import type { AccessPoint, AccessPoints } from "./accessPoints";
import { distanceM } from "./geo";
import { applyEdit, putInsAndTakeOuts, type ModeChange, type Trip } from "./trip";

/** How close an access point must be to be offered, in metres. */
export const SNAP_DISTANCE_M = 200;

/** A put-in or take-out and the access point it could snap to. */
export type SnapOffer = {
  readonly change: ModeChange;
  readonly accessPoint: AccessPoint;
  readonly distanceM: number;
};

/** Whether an access point's use fits the put-in or take-out. */
const fits = (accessPoint: AccessPoint, kind: ModeChange["kind"]) =>
  accessPoint.use === "both" || accessPoint.use === kind;

/**
 * The nearest access point within `SNAP_DISTANCE_M` that fits the mode change
 * (a put-in needs use put-in or both, a take-out take-out or both), or
 * undefined. A point already at the access point's position needs no offer.
 */
export function snapCandidate(trip: Trip, change: ModeChange, points: AccessPoints): SnapOffer | undefined {
  const at = trip.points[change.point];
  if (!at) return undefined;
  let best: SnapOffer | undefined;
  for (const accessPoint of points) {
    if (!fits(accessPoint, change.kind)) continue;
    const metres = distanceM(at, accessPoint.position);
    if (metres > SNAP_DISTANCE_M || (best && metres >= best.distanceM)) continue;
    best = { change, accessPoint, distanceM: metres };
  }
  return best && best.distanceM > 0 ? best : undefined;
}

/**
 * The put-ins and take-outs `after` has that `before` did not: points that
 * became one by a mode change or an added point. Only meaningful when `after`
 * keeps `before`'s points at their indexes.
 */
export function newModeChanges(before: Trip, after: Trip): ModeChange[] {
  const had = putInsAndTakeOuts(before);
  return putInsAndTakeOuts(after).filter((c) => !had.some((h) => h.point === c.point && h.kind === c.kind));
}

/**
 * The offers to snap the new put-ins and take-outs after an edit from `before` to `after`:
 * a mode change or an added point. An edit that shifts or drops points offers nothing.
 */
export function snapOffers(before: Trip, after: Trip, points: AccessPoints): SnapOffer[] {
  if (!before.points.every((point, i) => after.points[i] === point)) return [];
  return newModeChanges(before, after).flatMap((change) => snapCandidate(after, change, points) ?? []);
}

/** Moves the offer's point onto its access point: one undoable edit. */
export function snapToAccessPoint(trip: Trip, offer: SnapOffer): Trip {
  return applyEdit(trip, { type: "movePoint", index: offer.change.point, to: offer.accessPoint.position });
}
