// Using a suggested trip (ADR 0039): the ordinary trip it becomes, and the access its
// details show before it is used.
import type { AccessRules } from "./access";
import type { CalendarDate } from "./calendarDate";
import type { RouteNode } from "./routeNetwork";
import type { SuggestedTrip } from "./suggestedTrips";
import { setStartDate, type Trip } from "./trip";
import {
  tripAccess,
  type TripAccess,
  type TripAccessOptions,
} from "./tripAccess";

/**
 * The trip a suggested trip becomes: a point at each of its nodes, its legs in their modes, starting
 * on `date`. Its legs aren't routed yet: the planner routes them as for any trip.
 */
export function tripFromSuggestedTrip(
  suggestedTrip: SuggestedTrip,
  date: CalendarDate,
): Trip {
  const trip: Trip = {
    name: "",
    points: suggestedTrip.nodes.map(({ position: [lng, lat] }) => ({ lat, lng })),
    legs: suggestedTrip.legs.map((leg) => ({ mode: leg.mode })),
  };
  return setStartDate(trip, date);
}

/** The bank spots a suggested trip gets in or out at, once each: unchecked on the ground, so worth saving. */
export function bankSpotsOf(suggestedTrip: SuggestedTrip): RouteNode[] {
  const spots = suggestedTrip.nodes.filter((node) => node.kind === "bank-spot");
  return spots.filter((node, i) => spots.findIndex((other) => other.id === node.id) === i);
}

/** True when the trip's points are the suggested trip's nodes: it is the suggested trip, used. */
export function isTripFrom(trip: Trip, suggestedTrip: SuggestedTrip): boolean {
  return (
    trip.points.length === suggestedTrip.nodes.length &&
    trip.points.every(({ lat, lng }, i) => lng === suggestedTrip.nodes[i].position[0] && lat === suggestedTrip.nodes[i].position[1])
  );
}

/**
 * The access of a suggested trip's legs on `date`, as the trip it becomes will show it once routed
 * along the same water: its warnings are the warnings of hand-drawn legs.
 */
export function suggestedTripAccess(
  suggestedTrip: SuggestedTrip,
  date: CalendarDate,
  rules: AccessRules,
  options: TripAccessOptions,
): TripAccess {
  const trip = tripFromSuggestedTrip(suggestedTrip, date);
  const alongTheLines: Trip = {
    ...trip,
    legs: trip.legs.map((leg, i) => ({
      ...leg,
      route: {
        status: "routed",
        // The network has no heights, and the access check reads only the positions.
        geometry: suggestedTrip.legs[i].line.map(([lng, lat]) => ({
          lat,
          lng,
          elevation: 0,
        })),
      },
    })),
  };
  return tripAccess(alongTheLines, rules, options);
}
