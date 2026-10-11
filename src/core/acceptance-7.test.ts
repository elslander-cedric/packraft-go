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

// Round 2: rule approved by Cedric (ADR 0009 amendment). A pending hike leg has
// no time yet, and neither has the trip while any leg is pending. A failed hike
// leg is timed on distance only and marked; the trip includes it and the mark.
// Paddle legs are unchanged.
describe("#7 round 2: hike legs without climb data", () => {
  const failingRouter: Router = {
    route: async (): Promise<RouteResult> => ({ ok: false, failure: { kind: "unavailable" } }),
  };
  /** A router that fails hike legs and routes paddle legs. */
  const hikeFailsRouter: Router = {
    route: async (mode, points): Promise<RouteResult> =>
      mode === "hike"
        ? { ok: false, failure: { kind: "no-route" } }
        : { ok: true, geometry: points.map((p) => ({ ...p, elevation: 100 })) },
  };

  it("a hike leg that has not been routed yet is pending, and so is the trip", () => {
    let trip: Trip = emptyTrip();
    trip = applyEdit(trip, { type: "addPoint", at: east(0) });
    trip = applyEdit(trip, { type: "addPoint", at: east(10) });
    const s = summarise(trip);
    expect(s.legs[0].timeStatus).toBe("pending");
    expect(s.trip.timeStatus).toBe("pending");
  });

  it("a routed hike leg and its trip are plain estimates", async () => {
    const trip = await drawTrip(lineRouter(600), [east(0), east(10)]);
    const s = summarise(trip);
    expect(s.legs[0].timeStatus).toBe("estimated");
    expect(s.trip.timeStatus).toBe("estimated");
    expect(s.trip.timeH).toBeCloseTo(3, 6);
  });

  it("a failed hike leg gets a distance-only time (with pace factor), marked no-climb-data; the trip includes it", async () => {
    const trip = await drawTrip(failingRouter, [east(0), east(10)]);
    expect(trip.legs[0].route?.status).toBe("failed");
    const s = summarise(trip, settings({ paceFactor: 1.2 }));
    expect(s.legs[0].timeH).toBeCloseTo(2.4, 6);
    expect(s.legs[0].timeStatus).toBe("no-climb-data");
    expect(s.trip.timeH).toBeCloseTo(2.4, 6);
    expect(s.trip.timeStatus).toBe("no-climb-data");
  });

  it("failed hike + routed paddle: trip sums both and carries the marker; the paddle leg is a plain estimate", async () => {
    const trip = await drawTrip(hikeFailsRouter, [east(0), east(10), east(20)], ["hike", "paddle"]);
    expect(trip.legs.map((l) => l.route?.status)).toEqual(["failed", "routed"]);
    const s = summarise(trip);
    expect(s.legs[1].timeStatus).toBe("estimated");
    expect(s.legs[1].timeH).toBeCloseTo(2, 6);
    expect(s.trip.timeH).toBeCloseTo(4, 6);
    expect(s.trip.timeStatus).toBe("no-climb-data");
  });

  it("a failed paddle leg is unchanged: plain estimate, no marker on the trip", async () => {
    const trip = await drawTrip(failingRouter, [east(0), east(10)], ["paddle"]);
    expect(trip.legs[0].route?.status).toBe("failed");
    const s = summarise(trip);
    expect(s.legs[0].timeStatus).toBe("estimated");
    expect(s.legs[0].timeH).toBeCloseTo(2, 6);
    expect(s.trip.timeStatus).toBe("estimated");
  });

  it("a paddle leg still pending keeps its own time, but the trip is pending", async () => {
    const routed = await drawTrip(lineRouter(0), [east(0), east(10), east(20)], ["hike", "paddle"]);
    const trip: Trip = { ...routed, legs: [routed.legs[0], { mode: "paddle", route: { status: "pending" } }] };
    const s = summarise(trip);
    expect(s.legs[1].timeStatus).toBe("estimated");
    expect(s.legs[1].timeH).toBeCloseTo(2, 6);
    expect(s.trip.timeStatus).toBe("pending");
  });

  it("pending wins over no-climb-data for the trip", async () => {
    const failed = await drawTrip(failingRouter, [east(0), east(10)]);
    const trip = applyEdit(failed, { type: "addPoint", at: east(20) });
    const s = summarise(trip);
    expect(s.legs[0].timeStatus).toBe("no-climb-data");
    expect(s.legs[1].timeStatus).toBe("pending");
    expect(s.trip.timeStatus).toBe("pending");
  });
});
