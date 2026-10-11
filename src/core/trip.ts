// Trip planner core: pure TypeScript, no React, no network (spec #2, Seam 1).
import type { LegRoute } from "./router";

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
};

export type Edit = { readonly type: "addPoint"; readonly at: LatLng };

export function emptyTrip(): Trip {
  return { name: "", points: [], legs: [] };
}

/** Returns a new trip with the edit applied; the input trip is not changed. */
export function applyEdit(trip: Trip, edit: Edit): Trip {
  const legs: Leg[] = trip.points.length > 0 ? [...trip.legs, { mode: "hike" }] : [];
  return { ...trip, points: [...trip.points, edit.at], legs };
}
