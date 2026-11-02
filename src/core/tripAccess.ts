// Access status and warnings on a trip's paddle legs (GLOSSARY: Access status;
// ADRs 0022, 0024; #58). Built on the generic evaluation in ./access, so any
// rule data or flow readings passed in feed in without changes here.
import {
  accessAlong,
  combineAccess,
  officialNotChecked,
  type AccessReason,
  type AccessRules,
  type AccessState,
  type AccessStatus,
  type LockMarker,
} from "./access";
import { addDays, type CalendarDate } from "./calendarDate";
import type { FlowReadings } from "./flow";
import { locksOnLine, type LockWarning } from "./locks";
import { incidentsOn, incidentsOnLine, type IncidentWarning, type OfficialIncidents } from "./incident";
import type { OfficialCheck, OfficialReadings } from "./officialStatus";
import { obstaclesOnLine, type Obstacle, type ObstacleWarning } from "./obstacle";
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
  /** What couldn't be checked with the SPW for this leg (#211, #216). */
  readonly notChecked: readonly OfficialCheck[];
  /** True on a future date where the rules allow paddling but flow decides on the day. */
  readonly checkFlowOnTheDay: boolean;
  /** Why this leg may not be paddleable, most serious first. Information only: warnings never block. */
  readonly warnings: readonly AccessWarning[];
  /** Water on this leg with no known rules. A gentle note, never a warning (#78). */
  readonly notes: readonly AccessNote[];
  /** Locks this leg passes: portage required (#60). Real warnings, kept apart from the water's own. */
  readonly lockWarnings: readonly LockWarning[];
  /** Obstacles this leg passes, in the order it meets them (#215). Independent of date and flow. */
  readonly obstacleWarnings: readonly ObstacleWarning[];
  /** Incidents that apply on the leg's date and that it passes, in the order it meets them (#217). They never change `status`. */
  readonly incidentWarnings: readonly IncidentWarning[];
};

/**
 * Something about a paddle leg's water the planner should know, with the
 * reason (and its source) behind it:
 * - `forbidden`: an explicit ban.
 * - `closed`: legal water, closed on that date (season, fishing day, hours, flow).
 * - `check-flow`: rules OK on a future date, but flow decides on the day.
 */
export type AccessWarning = {
  readonly kind: "forbidden" | "closed" | "check-flow";
  readonly leg: number;
  readonly day: number;
  readonly date?: CalendarDate;
  readonly reason: AccessReason;
};

/**
 * Water on a paddle leg with no rule or no data (GLOSSARY: unknown means no
 * data, not "not allowed"). Presented as a quiet note and not counted as a
 * warning (#78). The reason is either "no-rule" or a region record that is
 * itself unknown, with its rule text.
 */
export type AccessNote = {
  readonly leg: number;
  readonly day: number;
  readonly date?: CalendarDate;
  readonly reason: AccessReason;
};

const warningKind: Record<AccessState, AccessWarning["kind"] | undefined> = {
  open: undefined,
  "closed-today": "closed",
  forbidden: "forbidden",
  unknown: undefined, // A note, not a warning.
  checking: undefined, // Nothing is claimed while the flow loads (#85).
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
export type AccessSummary = {
  readonly state?: AccessState;
  /** Real warnings only: forbidden, closed, check flow. Unknown access is not one (#78). */
  readonly warnings: readonly AccessWarning[];
  /** The notes of these legs, in leg order. */
  readonly notes: readonly AccessNote[];
  /** Lock warnings of these legs, in leg order (#60). Counted as warnings in summaries. */
  readonly lockWarnings: readonly LockWarning[];
  /** Obstacle warnings of these legs, in leg order (#215). */
  readonly obstacleWarnings: readonly ObstacleWarning[];
  /** Incident warnings of these legs, in leg order (#217). */
  readonly incidentWarnings: readonly IncidentWarning[];
  /** How many of these legs have water without known rules. */
  readonly legsWithoutRules: number;
};

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
  /** True while today's flows are loading: legs dated today on flow-dependent water are "checking" (#85). */
  readonly flowsPending?: boolean;
  /** Today's official status (#210), once known: legs dated today use it. */
  readonly official?: OfficialReadings;
  /** True while today's official status is loading: legs dated today on water it decides are "checking". */
  readonly officialPending?: boolean;
  /** The SPW's incidents (#216), once known: a paddle leg passing one on any date gets a warning (#217). They never change a leg's status. */
  readonly incidents?: OfficialIncidents;
  /** Lock markers (#57): a paddle leg passing one gets a lock warning (#60). */
  readonly locks?: readonly LockMarker[];
  /** Obstacles (ADR 0035): a paddle leg passing one gets an obstacle warning (#215). */
  readonly obstacles?: readonly Obstacle[];
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
function legAccess(
  when: When,
  status: AccessStatus,
  today: CalendarDate,
  incidents: OfficialIncidents | undefined,
  lockWarnings: readonly LockWarning[],
  obstacleWarnings: readonly ObstacleWarning[],
  incidentWarnings: readonly IncidentWarning[],
): LegAccess {
  const warnings = status.reasons.flatMap((reason): AccessWarning[] => {
    const kind = warningKind[reason.state];
    return kind ? [{ kind, ...when, reason }] : [];
  });
  const notes = status.reasons.flatMap((reason): AccessNote[] => (reason.state === "unknown" ? [{ ...when, reason }] : []));
  const future = when.date !== undefined && when.date > today;
  const blocked = status.state === "forbidden" || status.state === "closed-today";
  const flowReasons = future && !blocked
    ? status.reasons.filter((reason) => reason.kind === "rule" && reason.flowDependent && reason.state === "open")
    : [];
  for (const reason of flowReasons) warnings.push({ kind: "check-flow", ...when, reason });
  const notChecked = officialNotChecked(status, incidents);
  return { ...when, status, notChecked, checkFlowOnTheDay: flowReasons.length > 0, warnings, notes, lockWarnings, obstacleWarnings, incidentWarnings };
}

/** Access status and warnings for every paddle leg, day and the whole trip. */
export function tripAccess(
  trip: Trip,
  rules: AccessRules,
  { today, flows, flowsPending, official, officialPending, incidents, locks = [], obstacles = [] }: TripAccessOptions,
): TripAccess {
  const legs: (LegAccess | undefined)[] = trip.legs.map(() => undefined);
  const days = dayRanges(trip).map(([first, last], day): DayAccess => {
    const date = trip.startDate === undefined ? undefined : addDays(trip.startDate, day);
    const dayLegs: LegAccess[] = [];
    for (let leg = first; leg <= last; leg++) {
      if (trip.legs[leg].mode !== "paddle") continue;
      const line = legLine(trip, leg);
      if (!line) continue;
      const status = accessAlong(line, rules, {
        ...(date !== undefined && { date }),
        today,
        ...(flows && { flows }),
        ...(flowsPending && { flowsPending }),
        ...(official && { official }),
        ...(officialPending && { officialPending }),
      });
      const when = { leg, day, ...(date !== undefined && { date }) };
      const lockWarnings = locksOnLine(line, locks).map((lock): LockWarning => ({ lock, ...when }));
      const obstacleWarnings = obstaclesOnLine(line, obstacles).map((obstacle): ObstacleWarning => ({ obstacle, ...when }));
      const reported = incidents?.status === "ok" ? incidentsOn(incidents.incidents, date ?? today) : [];
      const incidentWarnings = incidentsOnLine(line, reported).map((incident): IncidentWarning => ({ incident, ...when }));
      dayLegs.push((legs[leg] = legAccess(when, status, today, incidents, lockWarnings, obstacleWarnings, incidentWarnings)));
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

/**
 * The access of the legs from `firstLeg` to `lastLeg` together, for a section's row: the
 * legs' own access gathered, adding nothing of its own (ADR 0029). Hike legs have none.
 */
export function legsAccess(access: TripAccess, { firstLeg, lastLeg }: { firstLeg: number; lastLeg: number }): AccessSummary {
  return summary(access.legs.slice(firstLeg, lastLeg + 1).filter((leg) => leg !== undefined));
}

/** The most restrictive state of these legs (absent without any) and all their warnings. */
function summary(legs: readonly LegAccess[]): AccessSummary {
  const warnings = legs.flatMap((leg) => leg.warnings);
  const notes = legs.flatMap((leg) => leg.notes);
  const lockWarnings = legs.flatMap((leg) => leg.lockWarnings);
  const obstacleWarnings = legs.flatMap((leg) => leg.obstacleWarnings);
  const incidentWarnings = legs.flatMap((leg) => leg.incidentWarnings);
  const legsWithoutRules = legs.filter((leg) => leg.notes.length > 0).length;
  const gathered = { warnings, notes, lockWarnings, obstacleWarnings, incidentWarnings, legsWithoutRules };
  if (legs.length === 0) return gathered;
  // A leg still checking its flow keeps the summary from reading open (#85); a worse state wins as usual.
  return { state: combineAccess(legs.map((leg) => leg.status)).state, ...gathered };
}
