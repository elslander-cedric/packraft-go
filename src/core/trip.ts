// Trip planner core: pure TypeScript, no React, no network (spec #2, Seam 1).
import { canUndo, deletePoint, movePoint, setLegMode, undoLastEdit, withUndoStep } from "./edits";
import type { LegRoute } from "./router";

export { canUndo };

export type LatLng = { readonly lat: number; readonly lng: number };

export type LegMode = "hike" | "paddle";

/**
 * A continuous stretch of the trip between two consecutive points, in one mode.
 * `route` is where the leg is in routing; a leg without one is routed next.
 * Rule for edits: an edit that changes a leg's endpoints or mode drops its
 * route, so only changed legs are routed again (ADR 0014).
 */
export type Leg = { readonly mode: LegMode; readonly route?: LegRoute };

/** Legs connect consecutive points: `legs[i]` runs from `points[i]` to `points[i + 1]`. */
export type Trip = {
  readonly name: string;
  readonly points: readonly LatLng[];
  readonly legs: readonly Leg[];
  /** The trip as it was before each edit, oldest first. Undo goes back one step. */
  readonly undoSteps?: readonly TripState[];
};

/** A trip without its undo steps: one state the planner can go back to. */
export type TripState = Omit<Trip, "undoSteps">;

export type Edit =
  | { readonly type: "addPoint"; readonly at: LatLng }
  | { readonly type: "movePoint"; readonly index: number; readonly to: LatLng }
  | { readonly type: "deletePoint"; readonly index: number }
  | { readonly type: "setLegMode"; readonly index: number; readonly mode: LegMode }
  | { readonly type: "undo" };

export function emptyTrip(): Trip {
  return { name: "", points: [], legs: [] };
}

/** Returns a new trip with the edit applied; the input trip is not changed. */
export function applyEdit(trip: Trip, edit: Edit): Trip {
  if (edit.type === "undo") return undoLastEdit(trip);
  return withUndoStep(trip, applyStep(trip, edit));
}

function applyStep(trip: Trip, edit: Exclude<Edit, { type: "undo" }>): Trip {
  if (edit.type === "movePoint") return movePoint(trip, edit.index, edit.to);
  if (edit.type === "deletePoint") return deletePoint(trip, edit.index);
  if (edit.type === "setLegMode") return setLegMode(trip, edit.index, edit.mode);
  const legs: Leg[] = trip.points.length > 0 ? [...trip.legs, { mode: "hike" }] : [];
  return { ...trip, points: [...trip.points, edit.at], legs };
}

/**
 * Where the trip gets on or off the water: a put-in where a hike leg ends and
 * a paddle leg begins, a take-out where a paddle leg ends and a hike leg
 * begins. `point` is the index of the point where the mode changes. Only
 * changes of mode count, so the trip's start and end are never marked.
 */
export type ModeChange = { readonly kind: "put-in" | "take-out"; readonly point: number };

export function putInsAndTakeOuts(trip: Trip): ModeChange[] {
  return trip.legs.flatMap((leg, i): ModeChange[] => {
    const before = trip.legs[i - 1];
    if (!before || before.mode === leg.mode) return [];
    return [{ kind: leg.mode === "paddle" ? "put-in" : "take-out", point: i }];
  });
}
