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
