// Tester's acceptance tests for #28 at the core seam.
import { describe, expect, it } from "vitest";
import { restoreStoredTrip, restoreTrip, serialiseTrip } from "./saveFile";
import { emptyTrip, type Trip } from "./trip";

const trip: Trip = { name: "Semois", points: [{ lat: 49.8, lng: 5.0 }], legs: [] };
const base = JSON.parse(serialiseTrip(trip));

describe("#28 restoring the autosave", () => {
  // Updated: format reset (#52). The current version is 1.
  it.each([1.0])("restores version %s", (version) => {
    expect(restoreStoredTrip(JSON.stringify({ ...base, version }))).toEqual({ trip, unknownVersion: false });
  });

  // Updated: format reset (#52). The old version 2 is unknown too.
  it.each([2, 3, 4, 1000, -1])("flags version %s as unknown and gives an empty trip", (version) => {
    expect(restoreStoredTrip(JSON.stringify({ ...base, version }))).toEqual({
      trip: emptyTrip(),
      unknownVersion: true,
    });
  });

  it.each(["", "null", "[]", "42", "\"text\"", "{", JSON.stringify({ format: "packraft-go-trip", trip: {} })])(
    "treats %j as corrupt: empty trip, not flagged, no throw",
    (text) => {
      expect(() => restoreStoredTrip(text)).not.toThrow();
      expect(restoreStoredTrip(text)).toEqual({ trip: emptyTrip(), unknownVersion: false });
    },
  );

  it("restoreTrip still returns just the trip", () => {
    expect(restoreTrip(JSON.stringify({ ...base, version: 3 }))).toEqual(emptyTrip());
    expect(restoreTrip(serialiseTrip(trip))).toEqual(trip);
  });
});
