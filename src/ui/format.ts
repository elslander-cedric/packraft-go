import { strings } from "./strings";

/** A distance in kilometres for display, e.g. "12.3 km". */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} ${strings.kilometreUnit}`;
}

/** A height difference in metres for display, e.g. "118 m". */
export function formatElevation(metres: number): string {
  return `${Math.round(metres)} ${strings.metreUnit}`;
}
