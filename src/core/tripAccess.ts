// Access status and warnings on a trip's paddle legs (GLOSSARY: Access status;
// ADRs 0022, 0024; #58). Built on the generic evaluation in ./access, so any
// rule data or flow readings passed in feed in without changes here.
import {
  accessAlong,
  type AccessReason,
  type AccessRules,
  type AccessState,
  type AccessStatus,
} from "./access";
import { addDays, type CalendarDate } from "./calendarDate";
import { dayRanges } from "./summarise";
import type { LatLng, Trip } from "./trip";

/** The access status of one paddle leg, for its day's date (or in general, for an undated trip). */
export type LegAccess = {
  readonly leg: number;
  /** Index of the leg's day, counted from 0. */
  readonly day: number;
  /** The day's date; absent for an undated trip. */
  readonly date?: CalendarDate;
  readonly status: AccessStatus;
  /** Why this leg may not be paddleable, most serious first. Information only: warnings never block. */
  readonly warnings: readonly AccessWarning[];
};

/**
 * Something about a paddle leg's water the planner should know, with the
 * reason (and its source) behind it:
 * - `forbidden`: an explicit ban.
 * - `closed`: legal water, closed on that date (season, fishing day, hours, flow).
 * - `unknown`: no rule or no data.
 */
export type AccessWarning = {
  readonly kind: "forbidden" | "closed" | "unknown";
  readonly leg: number;
  readonly day: number;
  readonly date?: CalendarDate;
  readonly reason: AccessReason;
};

const warningKind: Record<AccessState, AccessWarning["kind"] | undefined> = {
  open: undefined,
  "closed-today": "closed",
  forbidden: "forbidden",
  unknown: "unknown",
};

export type TripAccess = {
  /** True when the trip has a start date, so statuses are for dates; false means "in general". */
  readonly dated: boolean;
  /** Per leg: its access, or undefined for a hike leg or a paddle leg still being routed. */
  readonly legs: readonly (LegAccess | undefined)[];
};

/** What the access check needs besides the trip and the rules. */
export type TripAccessOptions = {
  /** Today's date, YYYY-MM-DD: later dates are in the future. */
  readonly today: CalendarDate;
};

/** The line a leg covers: its routed geometry, or a straight line when routing failed. */
function legLine(trip: Trip, index: number): readonly LatLng[] | undefined {
  const route = trip.legs[index].route;
  if (route?.status === "routed") return route.geometry;
  if (route?.status === "failed") return [trip.points[index], trip.points[index + 1]];
  return undefined; // Not routed yet: checked once its line is known.
}

/** Access status and warnings for every paddle leg, day and the whole trip. */
export function tripAccess(trip: Trip, rules: AccessRules, options: TripAccessOptions): TripAccess {
  void options;
  const legs: (LegAccess | undefined)[] = trip.legs.map(() => undefined);
  dayRanges(trip).forEach(([first, last], day) => {
    const date = trip.startDate === undefined ? undefined : addDays(trip.startDate, day);
    for (let leg = first; leg <= last; leg++) {
      if (trip.legs[leg].mode !== "paddle") continue;
      const line = legLine(trip, leg);
      if (!line) continue;
      const status = accessAlong(line, rules, date === undefined ? {} : { date });
      const when = { leg, day, ...(date !== undefined && { date }) };
      const warnings = status.reasons.flatMap((reason): AccessWarning[] => {
        const kind = warningKind[reason.state];
        return kind ? [{ kind, ...when, reason }] : [];
      });
      legs[leg] = { ...when, status, warnings };
    }
  });
  return { dated: trip.startDate !== undefined, legs };
}
