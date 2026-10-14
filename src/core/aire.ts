// The Walloon aire warning (#62, ADR 0023, AGW art. 5): in Wallonia you may only
// get on or off the water at an aire. A put-in or take-out there that is not
// near one of your access points of kind official aire gets a warning. It
// never blocks. Official aire locations come only from your own marks.
import { regionsAt, type AccessRules } from "./access";
import type { AccessPoints } from "./accessPoints";
import { addDays, type CalendarDate } from "./calendarDate";
import { distanceM } from "./geo";
import { SNAP_DISTANCE_M } from "./snap";
import { dayRanges } from "./summarise";
import { putInsAndTakeOuts, type Trip } from "./trip";

/** A Walloon put-in or take-out without an official aire of yours nearby. */
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
export function aireWarnings(trip: Trip, rules: AccessRules, points: AccessPoints): AireWarning[] {
  const aires = points.filter((p) => p.kind === "official-aire");
  const ranges = dayRanges(trip);
  return putInsAndTakeOuts(trip).flatMap(({ kind, point }): AireWarning[] => {
    const at = trip.points[point];
    if (!regionsAt(at, rules).includes("wallonia")) return [];
    if (aires.some((aire) => distanceM(at, aire.position) <= SNAP_DISTANCE_M)) return [];
    const leg = kind === "put-in" ? point : point - 1;
    const day = Math.max(0, ranges.findIndex(([first, last]) => leg >= first && leg <= last));
    const date = trip.startDate === undefined ? undefined : addDays(trip.startDate, day);
    return [{ kind, point, leg, day, ...(date !== undefined && { date }) }];
  });
}
