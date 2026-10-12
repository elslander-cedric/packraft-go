// Edits for the trip planner core: move and delete points, switch a leg's mode,
// mark or unmark a camp (spec #2, ADR 0017).
// Legs an edit changes are replaced by fresh, unrouted legs; legs it does not
// change are carried over as they are, so their routed results are kept.
import type { LatLng, Leg, LegMode, Trip } from "./trip";

/**
 * A leg with the same mode but no `route` (routed, pending or failed): the
 * auto router routes it again. Every edit that changes a leg goes through here.
 */
function unrouted(leg: Leg): Leg {
  return { mode: leg.mode };
}

export function movePoint(trip: Trip, index: number, to: LatLng): Trip {
  if (!(index in trip.points)) return trip;
  const points = trip.points.map((point, i) => (i === index ? to : point));
  // legs[index - 1] ends at the point and legs[index] starts at it.
  const legs = trip.legs.map((leg, i) => (i === index - 1 || i === index ? unrouted(leg) : leg));
  return { ...trip, points, legs };
}

/**
 * Switches a leg between hike and paddle. The leg loses its route, so it is
 * routed again with the new mode's profile; every other leg keeps its route.
 */
export function setLegMode(trip: Trip, index: number, mode: LegMode): Trip {
  const leg = trip.legs[index];
  if (!leg || leg.mode === mode) return trip;
  const legs = trip.legs.map((other, i) => (i === index ? unrouted({ ...other, mode }) : other));
  return { ...trip, legs };
}

/**
 * Marks the point as a camp, or unmarks it. A camp changes no leg, so every
 * leg keeps its route and nothing is routed again.
 */
export function toggleCamp(trip: Trip, index: number): Trip {
  if (!(index in trip.points)) return trip;
  const camps = trip.camps ?? [];
  const toggled = camps.includes(index)
    ? camps.filter((camp) => camp !== index)
    : [...camps, index].sort((a, b) => a - b);
  return { ...trip, camps: toggled };
}

/**
 * Records `before` as an undo step on `after`. Undo steps are whole earlier
 * states (they share unchanged points and legs, so they are cheap), which makes
 * every edit reversible, including the routed results it cleared.
 * An edit that changed nothing is not recorded.
 * A pending leg is recorded without a route: by the time undo brings it back
 * its request may have been answered, so it must be routed again rather than
 * wait for an answer that already came.
 */
export function withUndoStep(before: Trip, after: Trip): Trip {
  if (after === before) return before;
  const { undoSteps = [], ...state } = before;
  const recorded = state.legs.some((leg) => leg.route?.status === "pending")
    ? { ...state, legs: state.legs.map((leg) => (leg.route?.status === "pending" ? unrouted(leg) : leg)) }
    : state;
  return { ...after, undoSteps: [...undoSteps, recorded] };
}

export function canUndo(trip: Trip): boolean {
  return (trip.undoSteps?.length ?? 0) > 0;
}

/**
 * Goes back to the state before the last edit; with nothing to undo, returns the trip.
 * The trip's name is kept: naming is not an edit (see `renameTrip`).
 */
export function undoLastEdit(trip: Trip): Trip {
  const steps = trip.undoSteps ?? [];
  if (steps.length === 0) return trip;
  return { ...steps[steps.length - 1], name: trip.name, undoSteps: steps.slice(0, -1) };
}

/**
 * Removes a point. An end point takes its one leg with it; a middle point's
 * two legs merge into one unrouted leg with the earlier leg's mode.
 * A camp on the point goes with it; camps on later points stay on their points.
 */
export function deletePoint(trip: Trip, index: number): Trip {
  if (!(index in trip.points)) return trip;
  const points = trip.points.filter((_, i) => i !== index);
  const last = trip.points.length - 1;
  let legs: readonly Leg[];
  if (index === 0) legs = trip.legs.slice(1);
  else if (index === last) legs = trip.legs.slice(0, -1);
  else {
    const merged = unrouted(trip.legs[index - 1]);
    legs = [...trip.legs.slice(0, index - 1), merged, ...trip.legs.slice(index + 1)];
  }
  if (!trip.camps) return { ...trip, points, legs };
  const camps = trip.camps.filter((camp) => camp !== index).map((camp) => (camp > index ? camp - 1 : camp));
  return { ...trip, points, legs, camps };
}
