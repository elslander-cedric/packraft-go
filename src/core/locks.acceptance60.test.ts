// #60 acceptance: lock detection against the real built-in lock data.
import { describe, expect, it } from "vitest";
import { builtInLocks } from "../access/builtInRules";
import { locksOnLine } from "./locks";

const all = builtInLocks.locks;

describe("lock detection with the real lock data", () => {
  it("a line through the Anderlecht lock finds exactly that lock", () => {
    const line = [{ lat: 50.8175, lng: 4.3005 }, { lat: 50.8215, lng: 4.3028 }];
    expect(locksOnLine(line, all).map((l) => l.name)).toEqual(["Écluse d'Anderlecht - Sluis van Anderlecht"]);
  });

  it("a line about 300 m beside the lock finds nothing", () => {
    const line = [{ lat: 50.8175, lng: 4.3045 }, { lat: 50.8215, lng: 4.3068 }];
    expect(locksOnLine(line, all)).toEqual([]);
  });

  it("the two Albertkanaal chambers (182 m apart) warn once", () => {
    const line = [{ lat: 51.22696, lng: 4.5345 }, { lat: 51.22658, lng: 4.5395 }];
    expect(locksOnLine(line, all).map((l) => l.name)).toEqual(["Albertkanaal"]);
  });

  it("an empty line finds nothing", () => {
    expect(locksOnLine([], all)).toEqual([]);
  });
});
