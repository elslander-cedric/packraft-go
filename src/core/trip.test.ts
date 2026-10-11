import { describe, expect, it } from "vitest";
import { applyEdit, emptyTrip, newTripNeedsConfirmation, renameTrip } from "./trip";

const addPoint = (lat: number, lng: number) => ({ type: "addPoint", at: { lat, lng } }) as const;

describe("adding points", () => {
  it("the first point is the start of the trip and creates no leg", () => {
    const trip = applyEdit(emptyTrip(), addPoint(50, 4));
    expect(trip.points).toEqual([{ lat: 50, lng: 4 }]);
    expect(trip.legs).toEqual([]);
  });

  it("each further point adds a hike leg from the previous point", () => {
    const trip = [addPoint(50, 4), addPoint(50.1, 4.1), addPoint(50.2, 4.1)].reduce(
      applyEdit,
      emptyTrip(),
    );
    expect(trip.points).toEqual([
      { lat: 50, lng: 4 },
      { lat: 50.1, lng: 4.1 },
      { lat: 50.2, lng: 4.1 },
    ]);
    expect(trip.legs.map((leg) => leg.mode)).toEqual(["hike", "hike"]);
  });

  it("leaves the original trip unchanged", () => {
    const before = applyEdit(emptyTrip(), addPoint(50, 4));
    applyEdit(before, addPoint(51, 4));
    expect(before.points).toHaveLength(1);
    expect(before.legs).toHaveLength(0);
  });
});

describe("starting a new trip", () => {
  it("asks first when the current trip has a point, since it would be lost", () => {
    expect(newTripNeedsConfirmation(applyEdit(emptyTrip(), addPoint(50, 4)))).toBe(true);
  });

  it("does not ask when the current trip has no points, even if it is named", () => {
    expect(newTripNeedsConfirmation(emptyTrip())).toBe(false);
    expect(newTripNeedsConfirmation(renameTrip(emptyTrip(), "Lesse loop"))).toBe(false);
  });
});

describe("naming the trip", () => {
  it("sets the name and keeps points, legs and undo history", () => {
    const trip = applyEdit(applyEdit(emptyTrip(), addPoint(50, 4)), addPoint(50.1, 4.1));
    const named = renameTrip(trip, "Lesse loop");
    expect(named.name).toBe("Lesse loop");
    expect(named.points).toBe(trip.points);
    expect(named.legs).toBe(trip.legs);
    expect(applyEdit(named, { type: "undo" }).points).toEqual([{ lat: 50, lng: 4 }]);
  });

  it("undoing a leg mode switch made after naming keeps the name and brings back the hike leg", () => {
    const trip = applyEdit(applyEdit(emptyTrip(), addPoint(50, 4)), addPoint(50.1, 4.1));
    const switched = applyEdit(renameTrip(trip, "Lesse loop"), { type: "setLegMode", index: 0, mode: "paddle" });
    expect(switched.name).toBe("Lesse loop");
    expect(switched.legs.map((leg) => leg.mode)).toEqual(["paddle"]);

    const undone = applyEdit(switched, { type: "undo" });
    expect(undone.name).toBe("Lesse loop");
    expect(undone.legs.map((leg) => leg.mode)).toEqual(["hike"]);
  });

  it("is not an edit: undo keeps the name and goes back to the last route edit", () => {
    const trip = applyEdit(applyEdit(emptyTrip(), addPoint(50, 4)), addPoint(50.1, 4.1));
    const undone = applyEdit(renameTrip(trip, "Lesse loop"), { type: "undo" });
    expect(undone.name).toBe("Lesse loop");
    expect(undone.points).toEqual([{ lat: 50, lng: 4 }]);
  });
});
