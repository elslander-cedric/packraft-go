import { pointNumbersMinZoom } from "./mapConfig";

/**
 * Whether the route point at `index` (of `count`) shows its number at `zoom`: every point from
 * `pointNumbersMinZoom` on, further out only the first, the last and the selected one.
 */
export function isPointNumbered(index: number, count: number, selected: number | null, zoom: number): boolean {
  return zoom >= pointNumbersMinZoom || index === 0 || index === count - 1 || index === selected;
}
