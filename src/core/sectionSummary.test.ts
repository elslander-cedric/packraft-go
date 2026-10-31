// A section's totals: the figures of its legs, shown like a leg's. Drop is net, from the
// first put-in to the last take-out (GLOSSARY: Drop); time follows a day's rule (ADR 0009).
import { describe, expect, it } from "vitest";
import type { LegRoute, RoutedPoint } from "./router";
import { summarise } from "./summarise";
import type { Leg, LegMode, Trip } from "./trip";

/** A routed line of `elevations`, starting `start` thousandths of a degree east. */
function routed(start: number, elevations: number[]): Extract<LegRoute, { status: "routed" }> {
  const geometry: RoutedPoint[] = elevations.map((elevation, i) => ({ lat: 50, lng: 5 + (start + i) / 1000, elevation }));
  return { status: "routed", geometry };
}

/** A trip with these legs; points one thousandth of a degree apart. */
function trip(legs: Leg[], camps?: number[]): Trip {
  const points = Array.from({ length: legs.length + 1 }, (_, i) => ({ lat: 50, lng: 5 + i / 1000 }));
  return { name: "T", points, legs, ...(camps && { camps }) };
}

const leg = (mode: LegMode, route?: LegRoute): Leg => ({ mode, ...(route && { route }) });

describe("section totals", () => {
  it("has none without legs", () => {
    expect(summarise(trip([])).sections).toEqual([]);
  });

  it("totals the distance and time of its legs, and says which legs and day it covers", () => {
    const summary = summarise(trip([leg("paddle"), leg("paddle"), leg("hike"), leg("paddle")]));
    expect(summary.sections.map((s) => [s.mode, s.firstLeg, s.lastLeg, s.day])).toEqual([
      ["paddle", 0, 1, 1],
      ["hike", 2, 2, 1],
      ["paddle", 3, 3, 1],
    ]);
    const [first] = summary.sections;
    expect(first.distanceKm).toBeCloseTo(summary.legs[0].distanceKm + summary.legs[1].distanceKm, 6);
    expect(first.timeH).toBeCloseTo(summary.legs[0].timeH + summary.legs[1].timeH, 6);
  });

  it("splits at a camp, so a section falls on one day", () => {
    const { sections } = summarise(trip([leg("hike"), leg("hike"), leg("hike")], [2]));
    expect(sections.map((s) => [s.firstLeg, s.lastLeg, s.day])).toEqual([
      [0, 1, 1],
      [2, 2, 2],
    ]);
  });

  it("sums the climb and descent of a hike section's legs", () => {
    const summary = summarise(trip([leg("hike", routed(0, [100, 160])), leg("hike", routed(1, [160, 100]))]));
    const [section] = summary.sections;
    expect(section.climbM).toBeCloseTo((summary.legs[0].climbM ?? 0) + (summary.legs[1].climbM ?? 0), 6);
    expect(section.descentM).toBeCloseTo((summary.legs[0].descentM ?? 0) + (summary.legs[1].descentM ?? 0), 6);
    expect(section.climbM).toBeGreaterThan(0);
    expect(section.timeStatus).toBe("estimated");
  });

  it("counts the routed legs' climb while another hike leg waits, and says the time is pending", () => {
    const summary = summarise(trip([leg("hike", routed(0, [100, 160])), leg("hike")]));
    const [section] = summary.sections;
    expect(section.climbM).toBeCloseTo(summary.legs[0].climbM ?? 0, 6);
    expect(section.timeStatus).toBe("pending");
  });

  it("has no climb or descent until one of its hike legs is routed", () => {
    const [section] = summarise(trip([leg("hike"), leg("hike")])).sections;
    expect(section.climbM).toBeUndefined();
    expect(section.descentM).toBeUndefined();
  });

  it("says a failed hike leg leaves its time without climb data", () => {
    const failed: LegRoute = { status: "failed", failure: { kind: "no-route" } };
    const [section] = summarise(trip([leg("hike", routed(0, [100, 100])), leg("hike", failed)])).sections;
    expect(section.timeStatus).toBe("no-climb-data");
  });

  it("has no drop on a hike section, and no climb on a paddle section", () => {
    const { sections } = summarise(trip([leg("hike", routed(0, [100, 90])), leg("paddle", routed(1, [90, 80]))]));
    expect(sections[0].dropM).toBeUndefined();
    expect(sections[1].climbM).toBeUndefined();
    expect(sections[1].descentM).toBeUndefined();
  });

  it("has a net drop from the first put-in to the last take-out", () => {
    const [section] = summarise(trip([leg("paddle", routed(0, [100, 88])), leg("paddle", routed(1, [88, 93]))])).sections;
    expect(section.dropM).toBe(7);
    expect(section.riseM).toBeUndefined();
  });

  it("has a rise when the section ends higher, past the elevation noise", () => {
    const [section] = summarise(trip([leg("paddle", routed(0, [100, 96])), leg("paddle", routed(1, [96, 110]))])).sections;
    expect(section.riseM).toBe(10);
    expect(section.dropM).toBeUndefined();
  });

  it("treats a small net rise as no drop, like a leg", () => {
    const [section] = summarise(trip([leg("paddle", routed(0, [100, 101])), leg("paddle", routed(1, [101, 102]))])).sections;
    expect(section.dropM).toBe(0);
    expect(section.riseM).toBeUndefined();
  });

  it("has no drop or rise until every leg is routed", () => {
    const [section] = summarise(trip([leg("paddle", routed(0, [100, 90])), leg("paddle")])).sections;
    expect(section.dropM).toBeUndefined();
    expect(section.riseM).toBeUndefined();
  });
});
