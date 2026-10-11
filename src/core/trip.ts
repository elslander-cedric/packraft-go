// Trip planner core: pure TypeScript, no React, no network (spec #2, Seam 1).
import { canUndo, deletePoint, movePoint, undoLastEdit, withUndoStep } from "./edits";
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
  const legs: Leg[] = trip.points.length > 0 ? [...trip.legs, { mode: "hike" }] : [];
  return { ...trip, points: [...trip.points, edit.at], legs };
}
