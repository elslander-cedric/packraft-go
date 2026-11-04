import { describe, expect, it } from "vitest";
import { pointNumbersMinZoom } from "./mapConfig";
import { isPointNumbered } from "./pointNumbers";

const numbered = (count: number, selected: number | null, zoom: number) =>
  Array.from({ length: count }, (_, i) => i).filter((i) => isPointNumbered(i, count, selected, zoom));

describe("route point numbers", () => {
  it("number every point from the zoom on", () => {
    expect(numbered(5, null, pointNumbersMinZoom)).toEqual([0, 1, 2, 3, 4]);
  });

  it("number only the first and last point further out", () => {
    expect(numbered(5, null, pointNumbersMinZoom - 1)).toEqual([0, 4]);
  });

  it("number the selected point further out too", () => {
    expect(numbered(5, 2, pointNumbersMinZoom - 1)).toEqual([0, 2, 4]);
  });

  it("number a trip's only point", () => {
    expect(numbered(1, null, 6)).toEqual([0]);
  });
});
