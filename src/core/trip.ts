// Trip planner core: pure TypeScript, no React, no network (spec #2, Seam 1).
import { canUndo, deletePoint, movePoint, setLegMode, toggleCamp, undoLastEdit, withUndoStep } from "./edits";
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
  /**
   * Indices of the points marked as camps, in ascending order (ADR 0008).
   * Absent or empty when the trip has no camps. Use `isCamp` to read it.
   */
  readonly camps?: readonly number[];
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
  | { readonly type: "toggleCamp"; readonly index: number }
  | { readonly type: "undo" };

export function emptyTrip(): Trip {
  return { name: "", points: [], legs: [] };
}

/**
 * A new trip replaces the current one and cannot be undone, so the planner is
 * asked first when that would lose any points. A trip without points (even a
 * named one) is replaced without asking.
 */
export function newTripNeedsConfirmation(trip: Trip): boolean {
  return trip.points.length > 0;
}

/**
 * Names the trip. Naming is not an edit of the route (ADR 0017), so it is not
 * undone: undo keeps the current name.
 */
export function renameTrip(trip: Trip, name: string): Trip {
  return trip.name === name ? trip : { ...trip, name };
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
  if (edit.type === "toggleCamp") return toggleCamp(trip, edit.index);
  const legs: Leg[] = trip.points.length > 0 ? [...trip.legs, { mode: "hike" }] : [];
  return { ...trip, points: [...trip.points, edit.at], legs };
}

/** True when the point at `index` is marked as a camp. */
export function isCamp(trip: Trip, index: number): boolean {
  return trip.camps?.includes(index) ?? false;
}

/**
 * Where the trip gets on or off the water: a put-in where a stretch of paddle
 * legs begins (after a hike leg, or at the trip's start), a take-out where it
 * ends (before a hike leg, or at the trip's end). `point` is the index of the
 * point where the planner launches or gets off the water.
 */
export type ModeChange = { readonly kind: "put-in" | "take-out"; readonly point: number };

export function putInsAndTakeOuts(trip: Trip): ModeChange[] {
  // A stretch on the water starts or ends at every point whose two sides
  // differ in being paddle; the trip's ends count as dry land.
  const paddleBefore = (point: number) => trip.legs[point - 1]?.mode === "paddle";
  const paddleAfter = (point: number) => trip.legs[point]?.mode === "paddle";
  return trip.points.flatMap((_, point): ModeChange[] => {
    if (paddleBefore(point) === paddleAfter(point)) return [];
    return [{ kind: paddleAfter(point) ? "put-in" : "take-out", point }];
  });
}
