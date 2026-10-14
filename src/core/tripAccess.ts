// Access status and warnings on a trip's paddle legs (GLOSSARY: Access status;
// ADRs 0022, 0024; #58). Built on the generic evaluation in ./access, so any
// rule data or flow readings passed in feed in without changes here.
import {
  accessAlong,
  combineAccess,
  type AccessReason,
  type AccessRules,
  type AccessState,
  type AccessStatus,
} from "./access";
import { addDays, type CalendarDate } from "./calendarDate";
import type { FlowReadings } from "./flow";
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
  /** True on a future date where the rules allow paddling but flow decides on the day. */
  readonly checkFlowOnTheDay: boolean;
  /** Why this leg may not be paddleable, most serious first. Information only: warnings never block. */
  readonly warnings: readonly AccessWarning[];
};

/**
 * Something about a paddle leg's water the planner should know, with the
 * reason (and its source) behind it:
 * - `forbidden`: an explicit ban.
 * - `closed`: legal water, closed on that date (season, fishing day, hours, flow).
 * - `unknown`: no rule or no data.
 * - `check-flow`: rules OK on a future date, but flow decides on the day.
 */
export type AccessWarning = {
  readonly kind: "forbidden" | "closed" | "unknown" | "check-flow";
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
  /** Per day, in order. */
  readonly days: readonly DayAccess[];
  /** The whole trip. */
  readonly trip: AccessSummary;
};

/**
 * The access of several paddle legs together: the most restrictive state
 * (absent when none of them is checked yet) and all their warnings, in leg order.
 */
export type AccessSummary = { readonly state?: AccessState; readonly warnings: readonly AccessWarning[] };

export type DayAccess = AccessSummary & {
  /** Index of the day, counted from 0. */
  readonly day: number;
  /** The day's date; absent for an undated trip. */
  readonly date?: CalendarDate;
};

/** What the access check needs besides the trip and the rules. */
export type TripAccessOptions = {
  /** Today's date, YYYY-MM-DD: later dates are in the future. */
  readonly today: CalendarDate;
  /** Today's live flow readings (#61), once known: legs dated today use them. */
  readonly flows?: FlowReadings;
};

/** The line a leg covers: its routed geometry, or a straight line when routing failed. */
function legLine(trip: Trip, index: number): readonly LatLng[] | undefined {
  const route = trip.legs[index].route;
  if (route?.status === "routed") return route.geometry;
  if (route?.status === "failed") return [trip.points[index], trip.points[index + 1]];
  return undefined; // Not routed yet: checked once its line is known.
}

type When = Pick<LegAccess, "leg" | "day" | "date">;

/**
 * A leg's warnings from its status. On a future date, open flow-dependent
 * water can only be "rules OK; check flow on the day", unless the leg is
 * forbidden or closed anyway.
 */
function legAccess(when: When, status: AccessStatus, today: CalendarDate): LegAccess {
  const warnings = status.reasons.flatMap((reason): AccessWarning[] => {
    const kind = warningKind[reason.state];
    return kind ? [{ kind, ...when, reason }] : [];
  });
  const future = when.date !== undefined && when.date > today;
  const blocked = status.state === "forbidden" || status.state === "closed-today";
  const flowReasons = future && !blocked
    ? status.reasons.filter((reason) => reason.kind === "rule" && reason.flowDependent && reason.state === "open")
    : [];
  for (const reason of flowReasons) warnings.push({ kind: "check-flow", ...when, reason });
  return { ...when, status, checkFlowOnTheDay: flowReasons.length > 0, warnings };
}

/** Access status and warnings for every paddle leg, day and the whole trip. */
export function tripAccess(trip: Trip, rules: AccessRules, { today, flows }: TripAccessOptions): TripAccess {
  const legs: (LegAccess | undefined)[] = trip.legs.map(() => undefined);
  const days = dayRanges(trip).map(([first, last], day): DayAccess => {
    const date = trip.startDate === undefined ? undefined : addDays(trip.startDate, day);
    const dayLegs: LegAccess[] = [];
    for (let leg = first; leg <= last; leg++) {
      if (trip.legs[leg].mode !== "paddle") continue;
      const line = legLine(trip, leg);
      if (!line) continue;
      const status = accessAlong(line, rules, { ...(date !== undefined && { date }), today, ...(flows && { flows }) });
      dayLegs.push((legs[leg] = legAccess({ leg, day, ...(date !== undefined && { date }) }, status, today)));
    }
    return { day, ...(date !== undefined && { date }), ...summary(dayLegs) };
  });
  return {
    dated: trip.startDate !== undefined,
    legs,
    days,
    trip: summary(legs.filter((leg) => leg !== undefined)),
  };
}

/** The most restrictive state of these legs (absent without any) and all their warnings. */
function summary(legs: readonly LegAccess[]): AccessSummary {
  const warnings = legs.flatMap((leg) => leg.warnings);
  if (legs.length === 0) return { warnings };
  return { state: combineAccess(legs.map((leg) => leg.status)).state, warnings };
}
