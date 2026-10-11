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

  it("measures distance along the routed path", () => {
    const summary = summarise(
      routed([
        { lat: 0, lng: 0, elevation: 100 },
        { lat: 0, lng: 1, elevation: 250 },
        { lat: 1, lng: 1, elevation: 200 },
      ]),
    );
    expect(summary.legs[0].distanceKm).toBeCloseTo(2 * ONE_DEGREE_KM, 1);
    expect(summary.trip.distanceKm).toBeCloseTo(2 * ONE_DEGREE_KM, 1);
  });

  it("smooths climb and descent with a 5 m buffer: each sustained rise or fall counts beyond its first 5 m", () => {
    // Worked by hand: up 150 m then down 50 m gives 145 m climb and 45 m descent.
    const leg = summarise(
      routed([
        { lat: 0, lng: 0, elevation: 100 },
        { lat: 0, lng: 0.01, elevation: 250 },
        { lat: 0, lng: 0.02, elevation: 200 },
      ]),
    ).legs[0];
    expect(leg.climbM).toBe(145);
    expect(leg.descentM).toBe(45);
  });

  it("ignores elevation noise smaller than the buffer", () => {
    const wiggles = [100, 103, 100, 104, 101, 103, 100].map((elevation, i) => ({ lat: 0, lng: i / 100, elevation }));
    const leg = summarise(routed(wiggles)).legs[0];
    expect(leg.climbM).toBe(0);
    expect(leg.descentM).toBe(0);
  });

  it("uses the router's own smoothed climb when it gives one", () => {
    const geometry = [
      { lat: 0, lng: 0, elevation: 100 },
      { lat: 0, lng: 0.01, elevation: 250 },
      { lat: 0, lng: 0.02, elevation: 200 },
    ];
    const trip: Trip = {
      ...routed(geometry),
      legs: [{ mode: "hike", route: { status: "routed", geometry, climbM: 140 } }],
    };
    const leg = summarise(trip).legs[0];
    expect(leg.climbM).toBe(140);
    expect(leg.descentM).toBe(45);
  });

  it("gives the recorded BRouter track's length, BRouter's smoothed climb and a matching descent", async () => {
    const fetch = async () => new Response(readFileSync(FIXTURE, "utf8"));
    const result = await createBRouterRouter({ fetch }).route("hike", []);
    if (!result.ok) throw new Error("fixture should route");
    const trip: Trip = {
      ...routed([...result.geometry]),
      legs: [{ mode: "hike", route: { status: "routed", geometry: result.geometry, climbM: result.climbM } }],
    };

    const leg = summarise(trip).legs[0];
    // BRouter reports this track as 3232 m long, with a filtered ascend of 100 m.
    expect(Math.abs(leg.distanceKm - 3.232)).toBeLessThan(0.02);
    expect(leg.climbM).toBe(100);
    expect(leg.descentM).toBeCloseTo(59.25, 6);
    // The track ends 39.75 m higher than it starts (161.25 m to 201 m): climb minus descent agrees.
    expect(Math.abs(leg.climbM! - leg.descentM! - 39.75)).toBeLessThan(5);
  });

  it("has no climb or descent for a leg that is not routed yet", () => {
    const leg = summarise(tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).legs[0];
    expect(leg.climbM).toBeUndefined();
    expect(leg.descentM).toBeUndefined();
  });
});
