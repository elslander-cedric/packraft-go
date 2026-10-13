// Restoring the autosave (#28): a save from a newer or unknown version is kept,
// not discarded, so the planner can warn instead of silently losing the trip.
import { describe, expect, it } from "vitest";
import { restoreStoredTrip, serialiseTrip } from "./saveFile";
import { emptyTrip, type Trip } from "./trip";

const trip: Trip = {
  name: "Ourthe",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
  ],
  legs: [{ mode: "hike" }],
};
const saved = JSON.parse(serialiseTrip(trip));
const withVersion = (version: unknown) => JSON.stringify({ ...saved, version });

describe("restoring the autosave", () => {
  // Updated: format reset (#52). The current version is 1.
  it("restores a version 1 save, with nothing to keep", () => {
    expect(restoreStoredTrip(serialiseTrip(trip))).toEqual({ trip, unknownVersion: false });
  });

  it("starts empty when nothing is stored", () => {
    expect(restoreStoredTrip(null)).toEqual({ trip: emptyTrip(), unknownVersion: false });
  });

  // Updated: format reset (#52). The old version 2 is unknown; version 1 is current.
  it.each([3, 99, 2, 0, 1.5])("starts empty but flags a version %s save as an unknown version", (version) => {
    expect(restoreStoredTrip(withVersion(version))).toEqual({ trip: emptyTrip(), unknownVersion: true });
  });

  it.each([
    ["unparseable text", "{corrupt"],
    // Updated: format reset (#52). Damaged data in the current version, 1.
    ["damaged version 1 data", JSON.stringify({ ...saved, trip: { ...saved.trip, legs: [] } })],
    ["another format", JSON.stringify({ ...saved, format: "something-else" })],
    ["a version that is not a number", withVersion("3")],
  ])("starts empty without flagging %s, which is corrupt, not newer", (_, text) => {
    expect(restoreStoredTrip(text)).toEqual({ trip: emptyTrip(), unknownVersion: false });
  });
});
