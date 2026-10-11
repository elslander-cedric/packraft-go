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
  it("an empty trip has no legs, zero distance and no time", () => {
    expect(summarise(emptyTrip())).toEqual({ legs: [], trip: { distanceKm: 0, timeH: 0 } });
  });

  it("a trip with only a start point has no legs, zero distance and no time", () => {
    expect(summarise(tripThrough({ lat: 50, lng: 4 }))).toEqual({
      legs: [],
      trip: { distanceKm: 0, timeH: 0 },
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

describe("summarise paddle legs", () => {
  const paddle = (geometry: RoutedPoint[], climbM?: number): Trip => ({
    ...tripThrough(geometry[0], geometry[geometry.length - 1]),
    legs: [{ mode: "paddle", route: { status: "routed", geometry, climbM } }],
  });

  it("shows the drop (put-in elevation minus take-out elevation) instead of climb and descent", () => {
    const leg = summarise(
      paddle(
        [
          { lat: 0, lng: 0, elevation: 99 },
          { lat: 0, lng: 0.01, elevation: 104 },
          { lat: 0, lng: 0.02, elevation: 92 },
        ],
        3,
      ),
    ).legs[0];
    expect(leg.mode).toBe("paddle");
    expect(leg.dropM).toBe(7);
    expect(leg.climbM).toBeUndefined();
    expect(leg.descentM).toBeUndefined();
  });

  const endsAt = (start: number, end: number) =>
    summarise(
      paddle([
        { lat: 0, lng: 0, elevation: start },
        { lat: 0, lng: 0.01, elevation: end },
      ]),
    ).legs[0];

  it("a paddle leg that ends up to 2 m higher than it starts has a drop of 0 (elevation noise)", () => {
    expect(endsAt(90, 92)).toMatchObject({ dropM: 0 });
    expect(endsAt(90, 92).riseM).toBeUndefined();
    expect(endsAt(90, 90.5)).toMatchObject({ dropM: 0 });
  });

  it("a paddle leg that ends more than 2 m higher than it starts has a rise instead of a drop", () => {
    const leg = endsAt(90, 93);
    expect(leg.riseM).toBe(3);
    expect(leg.dropM).toBeUndefined();
  });

  it("rounds the rise to whole metres before the 2 m rule, so a rise shown as 2 m or less is a drop of 0", () => {
    // Updated in round 3: a 2.25 m rise used to be a rise; it rounds to 2 m.
    expect(endsAt(90, 92.25)).toMatchObject({ dropM: 0 });
    expect(endsAt(90, 92.4)).toMatchObject({ dropM: 0 });
    expect(endsAt(90, 92.4).riseM).toBeUndefined();
    const leg = endsAt(90, 92.6);
    expect(leg.riseM).toBeCloseTo(2.6, 9);
    expect(leg.dropM).toBeUndefined();
  });

  it("hike legs and paddle legs that drop have no rise", () => {
    expect(endsAt(99, 92).riseM).toBeUndefined();
  });

  it("a hike leg has no drop", () => {
    const geometry = [
      { lat: 0, lng: 0, elevation: 100 },
      { lat: 0, lng: 0.01, elevation: 90 },
    ];
    const trip: Trip = {
      ...tripThrough(geometry[0], geometry[1]),
      legs: [{ mode: "hike", route: { status: "routed", geometry } }],
    };
    expect(summarise(trip).legs[0].dropM).toBeUndefined();
  });

  it("a paddle leg that is not routed yet has no drop, only its straight-line distance", () => {
    const trip: Trip = { ...tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), legs: [{ mode: "paddle" }] };
    const leg = summarise(trip).legs[0];
    expect(leg.dropM).toBeUndefined();
    expect(leg.distanceKm).toBeCloseTo(ONE_DEGREE_KM, 1);
  });

  it("gives the recorded river track (Lesse, Walzin to Anseremme) its length and drop", async () => {
    const body = readFileSync(path.join(__dirname, "../routing/fixtures/river-success.geojson"), "utf8");
    const result = await createBRouterRouter({ fetch: async () => new Response(body) }).route("paddle", []);
    if (!result.ok) throw new Error("fixture should route");
    const trip: Trip = {
      ...tripThrough(result.geometry[0], result.geometry[result.geometry.length - 1]),
      legs: [{ mode: "paddle", route: { status: "routed", geometry: result.geometry, climbM: result.climbM } }],
    };

    const leg = summarise(trip).legs[0];
    // BRouter reports this track as 5892 m long; it runs from 99.25 m down to 92 m.
    expect(Math.abs(leg.distanceKm - 5.892)).toBeLessThan(0.03);
    expect(leg.dropM).toBeCloseTo(7.25, 6);
    expect(leg.climbM).toBeUndefined();
  });
});
