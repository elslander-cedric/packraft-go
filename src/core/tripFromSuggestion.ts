// Using a suggested trip (ADR 0039): the ordinary trip it becomes, and the access its
// details show before it is used.
import type { AccessRules } from "./access";
import type { CalendarDate } from "./calendarDate";
import type { SuggestedTrip } from "./suggestedTrips";
import { setStartDate, type Trip } from "./trip";
import {
  tripAccess,
  type TripAccess,
  type TripAccessOptions,
} from "./tripAccess";

/**
 * The trip a suggestion becomes: a point at each of its nodes, its legs in their modes, starting
 * on `date`. Its legs aren't routed yet: the planner routes them as for any trip.
 */
export function tripFromSuggestion(
  suggestion: SuggestedTrip,
  date: CalendarDate,
): Trip {
  const trip: Trip = {
    name: "",
    points: suggestion.nodes.map(({ position: [lng, lat] }) => ({ lat, lng })),
    legs: suggestion.legs.map((leg) => ({ mode: leg.mode })),
  };
  return setStartDate(trip, date);
}

/**
 * The access of a suggestion's legs on `date`, as the trip it becomes will show it once routed
 * along the same water: its warnings are the warnings of hand-drawn legs.
 */
export function suggestionAccess(
  suggestion: SuggestedTrip,
  date: CalendarDate,
  rules: AccessRules,
  options: TripAccessOptions,
): TripAccess {
  const trip = tripFromSuggestion(suggestion, date);
  const alongTheLines: Trip = {
    ...trip,
    legs: trip.legs.map((leg, i) => ({
      ...leg,
      route: {
        status: "routed",
        // The network has no heights, and the access check reads only the positions.
        geometry: suggestion.legs[i].line.map(([lng, lat]) => ({
          lat,
          lng,
          elevation: 0,
        })),
      },
    })),
  };
  return tripAccess(alongTheLines, rules, options);
}
