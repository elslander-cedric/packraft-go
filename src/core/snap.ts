// Snapping a put-in or take-out to one of your access points or an official aire
// (ADR 0023, ADR 0035, GLOSSARY "Snap offer"). Pure: the planner offers, and
// only an accepted offer changes the trip, as an ordinary undoable move.
import type { AccessPoint, AccessPoints, AccessPointUse } from "./accessPoints";
import { distanceM } from "./geo";
import { airePosition, type OfficialAire } from "./officialAire";
import { applyEdit, putInsAndTakeOuts, type LatLng, type ModeChange, type Trip } from "./trip";

/** How close a target must be to be offered, in metres. */
export const SNAP_DISTANCE_M = 200;

/** What a put-in or take-out can snap to. */
export type SnapTarget =
  | { readonly kind: "access-point"; readonly accessPoint: AccessPoint }
  | { readonly kind: "official-aire"; readonly aire: OfficialAire };

/** A put-in or take-out and the target it could snap to. */
export type SnapOffer = {
  readonly change: ModeChange;
  readonly target: SnapTarget;
  readonly distanceM: number;
};

const targetPosition = (target: SnapTarget): LatLng =>
  target.kind === "access-point" ? target.accessPoint.position : airePosition(target.aire);

/** Whether a use fits the put-in or take-out. */
export const fitsUse = (use: AccessPointUse, kind: ModeChange["kind"]) => use === "both" || use === kind;

/**
 * The nearest of your access points and the official aires within `SNAP_DISTANCE_M`
 * that fits the mode change (a put-in needs use put-in or both, a take-out take-out
 * or both), or undefined. Your own point wins a tie. A point already at the nearest
 * target needs no offer.
 */
export function snapCandidate(
  trip: Trip,
  change: ModeChange,
  points: AccessPoints,
  officialAires: readonly OfficialAire[],
): SnapOffer | undefined {
  const at = trip.points[change.point];
  if (!at) {
    return undefined;
  }
  const targets: { readonly use: AccessPointUse; readonly target: SnapTarget }[] = [
    ...points.map((accessPoint) => ({ use: accessPoint.use, target: { kind: "access-point", accessPoint } as const })),
    ...officialAires.map((aire) => ({ use: aire.use, target: { kind: "official-aire", aire } as const })),
  ];
  let best: SnapOffer | undefined;
  for (const { use, target } of targets) {
    if (!fitsUse(use, change.kind)) {
      continue;
    }
    const metres = distanceM(at, targetPosition(target));
    if (metres > SNAP_DISTANCE_M || (best && metres >= best.distanceM)) {
      continue;
    }
    best = { change, target, distanceM: metres };
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
  return putInsAndTakeOuts(after).filter(
    (putInsAndTakeOut) =>
      !had.some(
        (modeChange) => modeChange.point === putInsAndTakeOut.point && modeChange.kind === putInsAndTakeOut.kind,
      ),
  );
}

/**
 * The offers to snap the new put-ins and take-outs after an edit from `before` to `after`:
 * a mode change or an added point. An edit that shifts or drops points offers nothing.
 */
export function snapOffers(
  before: Trip,
  after: Trip,
  points: AccessPoints,
  officialAires: readonly OfficialAire[],
): SnapOffer[] {
  if (!before.points.every((point, i) => after.points[i] === point)) {
    return [];
  }
  return newModeChanges(before, after).flatMap((change) => snapCandidate(after, change, points, officialAires) ?? []);
}

/**
 * The offer to snap a point you moved when it is a put-in or take-out, or none:
 * a move keeps the leg modes, so only that point can be offered.
 */
export function movedPointOffers(
  after: Trip,
  index: number,
  points: AccessPoints,
  officialAires: readonly OfficialAire[],
): SnapOffer[] {
  return putInsAndTakeOuts(after)
    .filter((change) => change.point === index)
    .flatMap((change) => snapCandidate(after, change, points, officialAires) ?? []);
}

/** Moves the offer's point onto its target: one undoable edit of the trip, and nothing else. */
export function acceptSnap(trip: Trip, offer: SnapOffer): Trip {
  return applyEdit(trip, { type: "movePoint", index: offer.change.point, to: targetPosition(offer.target) });
}
