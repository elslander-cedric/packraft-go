// Acceptance tests for #7 (time estimates and settings), written by the tester
// from the ticket, spec #2 and ADR 0009 before reading the diff.
// Seam 1: the core. Routed legs come from an injected router; the recorded
// BRouter case goes through the adapter with a fake fetch. Never calls live
// BRouter (ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBRouterRouter } from "../routing/brouter";
import type { RouteResult, Router } from "./router";
import { createAutoRouter } from "./routing";
import { defaultSettings, restoreSettings, serialiseSettings, withSetting, type Settings } from "./settings";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type Edit, type LatLng, type LegMode, type Trip } from "./trip";

const KM_PER_DEGREE = (6371.0088 * Math.PI) / 180;
const east = (km: number): LatLng => ({ lat: 0, lng: km / KM_PER_DEGREE });

/** A router answering every leg with a straight line on the equator and the given climb. */
const lineRouter = (climbM: number | undefined): Router => ({
  route: async (_mode, points): Promise<RouteResult> => ({
    ok: true,
    geometry: points.map((p) => ({ ...p, elevation: 100 })),
    climbM,
  }),
});

/** Draws a trip through the points like the UI does, routing each leg through `router`. */
async function drawTrip(router: Router, points: LatLng[], modes: LegMode[] = []): Promise<Trip> {
  const state = { trip: emptyTrip() as Trip };
  const auto = createAutoRouter(router, (change) => {
    state.trip = change(state.trip);
  });
  const edit = async (e: Edit) => {
    state.trip = applyEdit(state.trip, e);
    await auto.sync(state.trip);
  };
  for (const at of points) await edit({ type: "addPoint", at });
  for (const [index, mode] of modes.entries()) {
    if (mode !== "hike") await edit({ type: "setLegMode", index, mode });
  }
  // Let any outstanding routing finish.
  await auto.sync(state.trip);
  return state.trip;
}

const settings = (s: Partial<Settings>): Settings => ({ ...defaultSettings, ...s });

describe("#7 AC2: hike time follows Naismith with pace factor (default 1.0)", () => {
  it("10 km + 600 m ascent at pace 1.0 is 3 h", async () => {
    const trip = await drawTrip(lineRouter(600), [east(0), east(10)]);
    expect(trip.legs[0].route?.status).toBe("routed");
    expect(summarise(trip, defaultSettings).legs[0].timeH).toBeCloseTo(3, 3);
    // Default settings are used when none are given.
    expect(summarise(trip).legs[0].timeH).toBeCloseTo(3, 3);
  });

  it("the default pace factor is 1.0", () => {
    expect(defaultSettings.paceFactor).toBe(1);
  });

  it("flat 5 km is 1 h; 0 km with 300 m ascent is 30 min", async () => {
    const flat = await drawTrip(lineRouter(0), [east(0), east(5)]);
    expect(summarise(flat).legs[0].timeH).toBeCloseTo(1, 3);
    const climbOnly = await drawTrip(lineRouter(300), [east(0), east(0.000001)]);
    expect(summarise(climbOnly).legs[0].timeH).toBeCloseTo(0.5, 3);
  });

  it("the pace factor scales the whole Naismith time (distance and climb)", async () => {
    const trip = await drawTrip(lineRouter(600), [east(0), east(10)]);
    expect(summarise(trip, settings({ paceFactor: 1.5 })).legs[0].timeH).toBeCloseTo(4.5, 3);
    expect(summarise(trip, settings({ paceFactor: 0.5 })).legs[0].timeH).toBeCloseTo(1.5, 3);
  });

  it("descent adds no time", async () => {
    // Route climbs 0 per the router; geometry descends.
    const descending: Router = {
      route: async (_m, points) => ({
        ok: true,
        geometry: [
          { ...points[0], elevation: 500 },
          { ...points[points.length - 1], elevation: 0 },
        ],
        climbM: 0,
      }),
    };
    const trip = await drawTrip(descending, [east(0), east(10)]);
    expect(summarise(trip).legs[0].timeH).toBeCloseTo(2, 3);
  });

  it("paddling speed does not change a hike leg", async () => {
    const trip = await drawTrip(lineRouter(600), [east(0), east(10)]);
    expect(summarise(trip, settings({ paddleSpeedKmh: 2 })).legs[0].timeH).toBeCloseTo(3, 3);
  });
});

describe("#7 AC3: paddle time uses the planner's speed (default 5 km/h)", () => {
  it("the default paddling speed is 5 km/h: 10 km takes 2 h", async () => {
    expect(defaultSettings.paddleSpeedKmh).toBe(5);
    const trip = await drawTrip(lineRouter(0), [east(0), east(10)], ["paddle"]);
    expect(trip.legs[0]).toMatchObject({ mode: "paddle", route: { status: "routed" } });
    expect(summarise(trip).legs[0].timeH).toBeCloseTo(2, 3);
  });

  it("speed changes the time: 10 km at 4 km/h is 2.5 h, at 8 km/h is 1.25 h", async () => {
    const trip = await drawTrip(lineRouter(0), [east(0), east(10)], ["paddle"]);
    expect(summarise(trip, settings({ paddleSpeedKmh: 4 })).legs[0].timeH).toBeCloseTo(2.5, 3);
    expect(summarise(trip, settings({ paddleSpeedKmh: 8 })).legs[0].timeH).toBeCloseTo(1.25, 3);
  });

  it("climb and pace factor do not change a paddle leg", async () => {
    const trip = await drawTrip(lineRouter(600), [east(0), east(10)], ["paddle"]);
    expect(summarise(trip, settings({ paceFactor: 3 })).legs[0].timeH).toBeCloseTo(2, 3);
  });
});

describe("#7 AC1 (core side): each leg and the trip have a time", () => {
  it("the trip time is the sum of a hike leg and a paddle leg", async () => {
    // Hike 10 km + 600 m (3 h), then paddle 10 km (2 h at 5 km/h).
    const trip = await drawTrip(lineRouter(600), [east(0), east(10), east(20)], ["hike", "paddle"]);
    const summary = summarise(trip);
    expect(summary.legs.map((l) => l.timeH)).toEqual([expect.closeTo(3, 3), expect.closeTo(2, 3)]);
    expect(summary.trip.timeH).toBeCloseTo(5, 3);
  });

  it("an empty trip has zero time", () => {
    expect(summarise(emptyTrip()).trip.timeH).toBe(0);
  });

  it("times update when a leg's mode changes", async () => {
    const hike = await drawTrip(lineRouter(600), [east(0), east(10)]);
    const paddle = await drawTrip(lineRouter(600), [east(0), east(10)], ["paddle"]);
    expect(summarise(hike).trip.timeH).toBeCloseTo(3, 3);
    expect(summarise(paddle).trip.timeH).toBeCloseTo(2, 3);
  });

  it("a recorded BRouter hiking leg gets a Naismith time from its distance and climb", async () => {
    const body = readFileSync(path.join(__dirname, "../routing/fixtures/hiking-success.geojson"), "utf8");
    const brouter = createBRouterRouter({ fetch: async () => new Response(body, { status: 200 }) });
    const trip = await drawTrip(brouter, [
      { lat: 50.21, lng: 4.94 },
      { lat: 50.216, lng: 4.933 },
    ]);
    const leg = summarise(trip).legs[0];
    expect(leg.climbM).toBeDefined();
    expect(leg.timeH).toBeCloseTo(leg.distanceKm / 5 + leg.climbM! / 600, 6);
    expect(summarise(trip, settings({ paceFactor: 2 })).legs[0].timeH).toBeCloseTo(2 * leg.timeH, 6);
  });
});

describe("#7 AC4/AC5 (core side): changing and restoring settings", () => {
  it("withSetting changes one setting and keeps the other", () => {
    expect(withSetting(defaultSettings, "paceFactor", 1.2)).toEqual({ paceFactor: 1.2, paddleSpeedKmh: 5 });
    expect(withSetting(defaultSettings, "paddleSpeedKmh", 3.5)).toEqual({ paceFactor: 1, paddleSpeedKmh: 3.5 });
  });

  it("unusable values (zero, negative, NaN, Infinity) are ignored", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(withSetting(defaultSettings, "paceFactor", bad)).toEqual(defaultSettings);
      expect(withSetting(defaultSettings, "paddleSpeedKmh", bad)).toEqual(defaultSettings);
    }
  });

  it("settings round-trip through their stored form", () => {
    const s = { paceFactor: 1.3, paddleSpeedKmh: 6.5 };
    expect(restoreSettings(serialiseSettings(s))).toEqual(s);
  });

  it("nothing stored, or unreadable stored values, fall back to defaults", () => {
    for (const stored of [null, "", "not json", "{", "null", "42", '"text"', "[]", "[1,2]", "true", "{}"]) {
      expect(restoreSettings(stored)).toEqual(defaultSettings);
    }
  });

  it("bad individual fields fall back to their default; good ones are kept", () => {
    expect(restoreSettings('{"paceFactor":-2,"paddleSpeedKmh":4}')).toEqual({ paceFactor: 1, paddleSpeedKmh: 4 });
    expect(restoreSettings('{"paceFactor":1.4,"paddleSpeedKmh":"fast"}')).toEqual({ paceFactor: 1.4, paddleSpeedKmh: 5 });
    expect(restoreSettings('{"paceFactor":0,"paddleSpeedKmh":null}')).toEqual(defaultSettings);
  });

  it("restored settings never produce a non-finite time", async () => {
    const trip = await drawTrip(lineRouter(600), [east(0), east(10), east(20)], ["hike", "paddle"]);
    for (const stored of ['{"paceFactor":0,"paddleSpeedKmh":0}', '{"paddleSpeedKmh":-5}', "garbage"]) {
      expect(Number.isFinite(summarise(trip, restoreSettings(stored)).trip.timeH)).toBe(true);
    }
  });
});
