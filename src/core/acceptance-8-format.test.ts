// Tester acceptance tests for #8, round 2: the save format rule Cedric approved.
// "The save format is version 2 and is always written as v2 (autosave and file).
// Loading accepts v1 (no camps) and v2. Any other version is refused with a
// clear 'newer/unknown version' message and the current trip is left untouched."
// Written from that rule and ADR 0011 before reading the round-2 diff.
// Updated: v1 dropped (#33). Version 2 is now the only version loaded; version 1
// is refused like any other unknown version.
import { describe, expect, it } from "vitest";
import { parseTrip, restoreTrip, serialiseTrip } from "./saveFile";
import { emptyTrip, type Trip } from "./trip";

const failed = { status: "failed", failure: { kind: "no-route" } } as const;
const trip: Trip = {
  name: "Two days",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
    { lat: 50.32, lng: 5.62 },
  ],
  legs: [
    { mode: "hike", route: failed },
    { mode: "paddle", route: failed },
  ],
};
const withCamp: Trip = { ...trip, camps: [1] };

const file = (version: unknown, t: Record<string, unknown> = { ...trip }) =>
  JSON.stringify({ format: "packraft-go-trip", version, trip: t });

describe("#8 round 2: always written as version 2", () => {
  it.each([
    ["an empty trip", emptyTrip()],
    ["a trip without camps", trip],
    ["a trip with camps", withCamp],
  ])("%s is saved as version 2", (_label, t) => {
    expect(JSON.parse(serialiseTrip(t))).toMatchObject({ format: "packraft-go-trip", version: 2 });
  });

  it("camps are in the version 2 save and come back", () => {
    const saved = JSON.parse(serialiseTrip(withCamp));
    expect(saved.trip.camps).toEqual([1]);
    expect(parseTrip(serialiseTrip(withCamp))).toEqual({ ok: true, trip: withCamp });
  });

});

// Updated: v1 dropped (#33). This block used to accept version 1 as well.
describe("loading accepts version 2 only", () => {
  it("version 1 is refused as an unknown version", () => {
    expect(parseTrip(file(1))).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("version 2 without camps loads as a trip without camps", () => {
    const parsed = parseTrip(file(2));
    expect(parsed).toEqual({ ok: true, trip });
  });

  it("version 2 with camps loads them", () => {
    expect(parseTrip(file(2, { ...trip, camps: [1] }))).toEqual({ ok: true, trip: withCamp });
  });

  it("autosave: version 2 is restored; version 1 falls back to an empty trip", () => {
    expect(restoreTrip(file(2, { ...trip, camps: [1] }))).toEqual(withCamp);
    expect(restoreTrip(file(1))).toEqual(emptyTrip());
  });
});

describe("#8 round 2: any other version is refused as newer or unknown", () => {
  it.each([3, 4, 99, 0, -1, 2.5, 1e9])("version %s is refused as an unknown version", (version) => {
    expect(parseTrip(file(version, { ...trip, camps: [1] }))).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("a newer version is refused even when its trip would otherwise be readable", () => {
    expect(parseTrip(serialiseTrip(withCamp).replace('"version":2', '"version":3'))).toMatchObject({
      ok: false,
      reason: "unknown-version",
    });
  });

  it("a newer version whose trip is in a shape this build doesn't know is still an unknown version, not 'damaged'", () => {
    expect(parseTrip(file(3, { stages: [], somethingNew: true }))).toEqual({ ok: false, reason: "unknown-version" });
  });

  it.each([
    ["not JSON", "{corrupt"],
    ["empty", ""],
    ["another format", JSON.stringify({ format: "other", version: 3, trip })],
    ["no version", JSON.stringify({ format: "packraft-go-trip", trip })],
    ["version 2 with a camp on a missing point", file(2, { ...trip, camps: [7] })],
    ["version 2 with camps that are not a list", file(2, { ...trip, camps: 1 })],
    ["version 2 with duplicate camps", file(2, { ...trip, camps: [1, 1] })],
    ["version 2 with a fractional camp", file(2, { ...trip, camps: [0.5] })],
  ])("damaged data (%s) is refused as invalid, not as an unknown version", (_label, text) => {
    const parsed = parseTrip(text);
    expect(parsed.ok).toBe(false);
    expect(parsed).not.toHaveProperty("reason", "unknown-version");
  });

  it.each([
    ["version 3", file(3, { ...trip, camps: [1] })],
    ["version 99", file(99)],
    ["version 0", file(0)],
    ["corrupt", "{corrupt"],
    ["version 2 with bad camps", file(2, { ...trip, camps: [9] })],
  ])("autosave holding %s falls back to an empty trip without throwing", (_label, text) => {
    expect(() => restoreTrip(text)).not.toThrow();
    expect(restoreTrip(text)).toEqual(emptyTrip());
  });
});
