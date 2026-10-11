import { strings } from "./strings";

/** A distance in kilometres for display, e.g. "12.3 km". */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} ${strings.kilometreUnit}`;
}
