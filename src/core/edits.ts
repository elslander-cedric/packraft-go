// Point edits for the trip planner core: move and delete (spec #2, ADR 0017).
// Legs an edit changes are replaced by fresh, unrouted legs; legs it does not
// change are carried over as they are, so their routed results are kept.
import type { LatLng, Leg, Trip } from "./trip";

/** A leg with the same mode but no routed result: it needs routing again. */
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
 * Removes a point. An end point takes its one leg with it; a middle point's
 * two legs merge into one unrouted leg with the earlier leg's mode.
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
  return { ...trip, points, legs };
}
