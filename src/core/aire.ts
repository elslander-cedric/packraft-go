// The Walloon aire warning (ADR 0023, AGW art. 5): in Wallonia you may only
// get on or off the water at an aire. A put-in or take-out there that is not
// near an aire gets a warning. It never blocks. Two things count as an aire: your
// own access points of kind official aire, whatever their use, and the built-in
// official aires (ADR 0035), which must fit the put-in or take-out.
import { regionsAt, type AccessRules } from "./access";
import type { AccessPoints } from "./accessPoints";
import { addDays, type CalendarDate } from "./calendarDate";
import { distanceM } from "./geo";
import { airePosition, type OfficialAire } from "./officialAire";
import { fitsUse, SNAP_DISTANCE_M } from "./snap";
import { dayRanges } from "./summarise";
import { putInsAndTakeOuts, type Trip } from "./trip";

/** A Walloon put-in or take-out with no aire nearby that it can use. */
export type AireWarning = {
  readonly kind: "put-in" | "take-out";
  /** Index of the trip point. */
  readonly point: number;
  /** The paddle leg that starts (put-in) or ends (take-out) there. */
  readonly leg: number;
  /** Index of the leg's day, counted from 0. */
  readonly day: number;
  readonly date?: CalendarDate;
};

/** Warnings for every put-in and take-out in Wallonia that is not within ~200 m of an official aire. */
export function aireWarnings(
  trip: Trip,
  rules: AccessRules,
  points: AccessPoints,
  officialAires: readonly OfficialAire[],
): AireWarning[] {
  const marks = points.filter((p) => p.kind === "official-aire");
  const ranges = dayRanges(trip);
  return putInsAndTakeOuts(trip).flatMap(({ kind, point }): AireWarning[] => {
    const at = trip.points[point];
    if (!regionsAt(at, rules).includes("wallonia")) return [];
    if (marks.some((mark) => distanceM(at, mark.position) <= SNAP_DISTANCE_M)) return [];
    const usable = officialAires.filter((aire) => fitsUse(aire.use, kind));
    if (usable.some((aire) => distanceM(at, airePosition(aire)) <= SNAP_DISTANCE_M)) return [];
    const leg = kind === "put-in" ? point : point - 1;
    const day = Math.max(0, ranges.findIndex(([first, last]) => leg >= first && leg <= last));
    const date = trip.startDate === undefined ? undefined : addDays(trip.startDate, day);
    return [{ kind, point, leg, day, ...(date !== undefined && { date }) }];
  });
}
