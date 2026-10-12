// Sections (ADR 0021): runs of consecutive legs of the same mode, ending where
// the mode changes or at a camp. Each section becomes its own GPX file.
import { describe, expect, it } from "vitest";
import { tripSections } from "./sections";
import type { LegMode, Trip } from "./trip";

/** A trip with one leg per mode in `modes`, points along a line, and the given camps. */
function trip(modes: LegMode[], camps?: number[]): Trip {
  const points = Array.from({ length: modes.length + 1 }, (_, i) => ({ lat: 50 + i / 100, lng: 5 }));
  return { name: "T", points, legs: modes.map((mode) => ({ mode })), camps };
}

/** The sections as [first leg, last leg, mode, day] for compact expectations. */
const sectionsOf = (t: Trip) => tripSections(t).map((s) => [s.firstLeg, s.lastLeg, s.mode, s.day]);

describe("trip sections", () => {
  it("has no sections without legs", () => {
    expect(tripSections(trip([]))).toEqual([]);
  });

  it("makes a single leg one section", () => {
    expect(sectionsOf(trip(["hike"]))).toEqual([[0, 0, "hike", 1]]);
  });

  it("joins consecutive legs of the same mode into one section", () => {
    expect(sectionsOf(trip(["paddle", "paddle", "paddle"]))).toEqual([[0, 2, "paddle", 1]]);
  });

  it("starts a new section at every mode change", () => {
    expect(sectionsOf(trip(["hike", "paddle", "hike", "paddle"]))).toEqual([
      [0, 0, "hike", 1],
      [1, 1, "paddle", 1],
      [2, 2, "hike", 1],
      [3, 3, "paddle", 1],
    ]);
  });

  it("ends a section at a camp in the middle of a same-mode run, starting the next day", () => {
    expect(sectionsOf(trip(["hike", "hike", "hike", "hike"], [2]))).toEqual([
      [0, 1, "hike", 1],
      [2, 3, "hike", 2],
    ]);
  });

  it("splits once at a camp that is also a mode change", () => {
    expect(sectionsOf(trip(["hike", "hike", "paddle", "paddle"], [2]))).toEqual([
      [0, 1, "hike", 1],
      [2, 3, "paddle", 2],
    ]);
  });

  it("makes a portage (a short hike between paddle legs) its own section", () => {
    expect(sectionsOf(trip(["paddle", "paddle", "hike", "paddle"]))).toEqual([
      [0, 1, "paddle", 1],
      [2, 2, "hike", 1],
      [3, 3, "paddle", 1],
    ]);
  });

  it("splits nothing for camps at the start or end point", () => {
    expect(sectionsOf(trip(["hike", "hike"], [0, 2]))).toEqual([[0, 1, "hike", 1]]);
  });

  it("adds no empty section for a trip ending on a camp point", () => {
    expect(sectionsOf(trip(["hike", "paddle"], [1, 2]))).toEqual([
      [0, 0, "hike", 1],
      [1, 1, "paddle", 2],
    ]);
  });

  it("numbers days across several camps", () => {
    expect(sectionsOf(trip(["hike", "paddle", "paddle", "hike"], [1, 3]))).toEqual([
      [0, 0, "hike", 1],
      [1, 2, "paddle", 2],
      [3, 3, "hike", 3],
    ]);
  });
});
