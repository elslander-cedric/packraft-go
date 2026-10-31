import type { TimeStatus } from "@/core/summarise";
import { strings } from "./strings";

/** A distance in kilometres for display, e.g. "12.3 km". */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} ${strings.kilometreUnit}`;
}

/** A height difference in metres for display, e.g. "118 m". */
export function formatElevation(metres: number): string {
  return `${Math.round(metres)} ${strings.metreUnit}`;
}

/** An estimated time in hours for display, e.g. "3 h 05 min", or "45 min" under an hour. */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  if (h === 0) return `${min} ${strings.minuteUnit}`;
  return `${h} ${strings.hourUnit} ${String(min).padStart(2, "0")} ${strings.minuteUnit}`;
}

/**
 * A day's calendar date ("YYYY-MM-DD") in parts, e.g. Sat / 31 / Oct / 2026, for the
 * day card's calendar tile. Read in UTC, so it never shifts a day.
 */
export function dayDateParts(date: string): { weekday: string; day: number; month: string; year: number } {
  const day = new Date(`${date}T00:00:00Z`);
  return {
    weekday: strings.weekdayNames[day.getUTCDay()],
    day: day.getUTCDate(),
    month: strings.monthNames[day.getUTCMonth()],
    year: day.getUTCFullYear(),
  };
}

/** A day's calendar date ("YYYY-MM-DD") for display, e.g. "Sat 31 Oct 2026". Read in UTC, so it never shifts a day. */
export function formatDayDate(date: string): string {
  const { weekday, day, month, year } = dayDateParts(date);
  return strings.dayDate(weekday, day, month, year);
}

/** A river's flow for display, in m³/s with at most two decimals (#61). */
export function formatFlow(m3s: number): string {
  return strings.flow.m3s(String(Math.round(m3s * 100) / 100));
}

/**
 * When a flow reading was taken (#61). The service's timestamp is the gauge's
 * local time with its offset; its date and time are read from the text, so the
 * planner's own time zone never shifts them.
 */
export function formatReadingTime(at: string): string {
  return strings.flow.readingTime(formatDayDate(at.slice(0, 10)), at.slice(11, 16));
}

/**
 * A time estimate for display (ADR 0009, amended): "…" while it waits for
 * routing, and marked when it counts distance only.
 */
export function formatTimeEstimate(hours: number, status: TimeStatus): string {
  if (status === "pending") return strings.timePending;
  const duration = formatDuration(hours);
  return status === "no-climb-data" ? strings.timeWithoutClimb(duration) : duration;
}
