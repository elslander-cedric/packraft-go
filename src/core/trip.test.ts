import { describe, expect, it } from "vitest";
import { applyEdit, emptyTrip } from "./trip";

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
