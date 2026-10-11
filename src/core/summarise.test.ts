import { describe, expect, it } from "vitest";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const tripThrough = (...points: LatLng[]) =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

// One degree of arc on a sphere with the Earth's mean radius (6371 km) is 111.19 km.
const ONE_DEGREE_KM = 111.19;

describe("summarise", () => {
  it("an empty trip has no legs and zero distance", () => {
    expect(summarise(emptyTrip())).toEqual({ legs: [], trip: { distanceKm: 0 } });
  });

  it("a trip with only a start point has no legs and zero distance", () => {
    expect(summarise(tripThrough({ lat: 50, lng: 4 }))).toEqual({
      legs: [],
      trip: { distanceKm: 0 },
    });
  });

  it("gives each straight leg's distance and the trip total", () => {
    const summary = summarise(
      tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }),
    );
    expect(summary.legs.map((leg) => leg.mode)).toEqual(["hike", "hike"]);
    expect(summary.legs[0].distanceKm).toBeCloseTo(ONE_DEGREE_KM, 1);
    expect(summary.legs[1].distanceKm).toBeCloseTo(ONE_DEGREE_KM, 1);
    expect(summary.trip.distanceKm).toBeCloseTo(2 * ONE_DEGREE_KM, 1);
  });

  it("measures along the great circle, so east-west legs shrink away from the equator", () => {
    // At 60° latitude a degree of longitude is about half as long as at the equator.
    const summary = summarise(tripThrough({ lat: 60, lng: 4 }, { lat: 60, lng: 5 }));
    expect(summary.legs[0].distanceKm).toBeCloseTo(55.6, 1);
  });
});
