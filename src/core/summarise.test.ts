import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBRouterRouter } from "../routing/brouter";
import type { RoutedPoint } from "./router";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type LatLng, type Trip } from "./trip";

const FIXTURE = path.join(__dirname, "../routing/fixtures/hiking-success.geojson");

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

describe("summarise routed hike legs", () => {
  const routed = (geometry: RoutedPoint[]): Trip => ({
    ...tripThrough(geometry[0], geometry[geometry.length - 1]),
    legs: [{ mode: "hike", route: { status: "routed", geometry } }],
  });

  it("measures distance along the routed path, with climb and descent from its elevations", () => {
    const summary = summarise(
      routed([
        { lat: 0, lng: 0, elevation: 100 },
        { lat: 0, lng: 1, elevation: 250 },
        { lat: 1, lng: 1, elevation: 200 },
      ]),
    );
    expect(summary.legs[0].distanceKm).toBeCloseTo(2 * ONE_DEGREE_KM, 1);
    expect(summary.legs[0].climbM).toBe(150);
    expect(summary.legs[0].descentM).toBe(50);
    expect(summary.trip.distanceKm).toBeCloseTo(2 * ONE_DEGREE_KM, 1);
  });

  it("gives the recorded BRouter track's length, climb and descent", async () => {
    const fetch = async () => new Response(readFileSync(FIXTURE, "utf8"));
    const result = await createBRouterRouter({ fetch }).route("hike", []);
    if (!result.ok) throw new Error("fixture should route");

    const leg = summarise(routed([...result.geometry])).legs[0];
    // BRouter reports this track as 3232 m long.
    expect(Math.abs(leg.distanceKm - 3.232)).toBeLessThan(0.02);
    expect(leg.climbM).toBeCloseTo(118, 6);
    expect(leg.descentM).toBeCloseTo(78.25, 6);
  });

  it("has no climb or descent for a leg that is not routed yet", () => {
    const leg = summarise(tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).legs[0];
    expect(leg.climbM).toBeUndefined();
    expect(leg.descentM).toBeUndefined();
  });
});
