import { useState } from "react";
import type { LegMode, Trip } from "@/core/trip";

/**
 * A mode picked for the next leg, and the trip state it was picked for. Every edit, undo,
 * New trip and Open trip replace the trip's points and undo steps; routing keeps them.
 */
type Pick = {
  mode: LegMode;
  points: Trip["points"];
  undoSteps: Trip["undoSteps"];
  /** The first point is being added: the pick carries over to the trip with that point. */
  carry?: boolean;
};

const pickFor = (mode: LegMode, trip: Trip): Pick => ({ mode, points: trip.points, undoSteps: trip.undoSteps });
const stillHolds = (pick: Pick, trip: Trip) => pick.points === trip.points && pick.undoSteps === trip.undoSteps;

/**
 * The next leg's mode: the last leg's mode (hike for an empty trip), unless you picked another
 * since the trip last changed. Any edit drops the pick; routing doesn't. Only the first point,
 * which adds no leg, carries it over to the second.
 */
export function useNextLegMode(trip: Trip) {
  const [pick, setPick] = useState<Pick | null>(null);

  // The trip changed since the pick: drop it, or carry it over the first point.
  let current = pick;
  if (pick !== null && !stillHolds(pick, trip)) {
    current = pick.carry && trip.points.length === 1 ? pickFor(pick.mode, trip) : null;
    setPick(current);
  }

  const lastLegMode = trip.legs[trip.legs.length - 1]?.mode;
  return {
    nextMode: current?.mode ?? lastLegMode ?? "hike",
    pickMode: (mode: LegMode) => setPick(pickFor(mode, trip)),
    /** Call just before adding a point, so a pick made on an empty trip survives its first point. */
    keepOverFirstPoint: () => {
      if (current !== null && trip.points.length === 0) {
        setPick({ ...current, carry: true });
      }
    },
  };
}
