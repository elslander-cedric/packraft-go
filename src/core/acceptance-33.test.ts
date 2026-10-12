// Tester acceptance tests for #33: version 2 is the only save-format version.
// Written from the issue before reading the diff: version 1 is treated exactly
// like any other unsupported version, whatever the file holds.
import { describe, expect, it } from "vitest";
import { parseTrip, restoreTrip, serialiseTrip, SAVE_VERSION } from "./saveFile";
import { emptyTrip, type Trip } from "./trip";

const trip: Trip = {
  name: "Ourthe",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
    { lat: 50.32, lng: 5.62 },
  ],
  legs: [{ mode: "hike" }, { mode: "paddle" }],
};
const file = (version: unknown, body: Record<string, unknown> = trip) =>
  JSON.stringify({ format: "packraft-go-trip", version, trip: body });

const bodies: [string, Record<string, unknown>][] = [
  ["a valid trip without camps", trip],
  ["a valid trip with camps", { ...trip, camps: [1] }],
  ["an empty trip", { name: "", points: [], legs: [] }],
  ["legs not matching points", { ...trip, legs: [{ mode: "hike" }] }],
  ["camps on a missing point", { ...trip, camps: [9] }],
];

describe("#33: version 1 is refused like any other unsupported version", () => {
  it("the current version is 2", () => {
    expect(SAVE_VERSION).toBe(2);
    expect(JSON.parse(serialiseTrip(trip)).version).toBe(2);
  });

  it.each(bodies)("Open file: version 1 holding %s gives the same unknown-version result as version 3", (_, body) => {
    expect(parseTrip(file(1, body))).toEqual({ ok: false, reason: "unknown-version" });
    expect(parseTrip(file(1, body))).toEqual(parseTrip(file(3, body)));
  });

  it.each(bodies)("autosave: version 1 holding %s falls back to an empty trip, like version 3", (_, body) => {
    expect(restoreTrip(file(1, body))).toEqual(emptyTrip());
    expect(restoreTrip(file(1, body))).toEqual(restoreTrip(file(3, body)));
  });

  it("version 1 written as a string or float is not mistaken for a supported version", () => {
    expect(parseTrip(file("1"))).toEqual({ ok: false });
    expect(parseTrip(file("2"))).toEqual({ ok: false });
    expect(parseTrip(file(1.0))).toEqual({ ok: false, reason: "unknown-version" });
    expect(parseTrip(file(2.0))).toEqual({ ok: true, trip });
  });

  it("version 2 still loads, with and without camps", () => {
    expect(parseTrip(file(2))).toEqual({ ok: true, trip });
    expect(parseTrip(file(2, { ...trip, camps: [1] }))).toEqual({ ok: true, trip: { ...trip, camps: [1] } });
    expect(restoreTrip(file(2))).toEqual(trip);
  });

  it("damaged version 2 data is still refused as damaged, not as an unknown version", () => {
    expect(parseTrip(file(2, { ...trip, legs: [{ mode: "hike" }] }))).toEqual({ ok: false });
    expect(parseTrip(file(2, { ...trip, camps: [9] }))).toEqual({ ok: false });
  });
});
