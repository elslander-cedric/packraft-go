// Acceptance tests for #9 (autosave, restore, name and new trip), written from
// the issue, its comments and spec #2. Seam 1 only: build trips with
// the core's public functions, save and restore them, and read trip and figures.
import { describe, expect, it } from "vitest";
import type { Router, RouteResult } from "./router";
import { createAutoRouter } from "./routing";
import { routingInto } from "./testing/routingDispatch";
import { parseTrip, restoreTrip, serialiseTrip } from "./saveFile";
import { summarise } from "./summarise";
import { applyEdit, canUndo, emptyTrip, renameTrip, type LatLng, type Trip } from "./trip";

const A = { lat: 50.3527, lng: 5.4561 };
const B = { lat: 50.2678, lng: 5.4469 };
const C = { lat: 50.1833, lng: 5.5756 };

// Per-point elevations rise 99 m in total, but the router reported 100 m (note on #9 from #4).
const ROUTED_99_VS_100: Trip["legs"][number] = {
  mode: "hike",
  route: {
    status: "routed",
    geometry: [
      { ...A, elevation: 100 },
      { lat: 50.31, lng: 5.45, elevation: 199 },
      { ...B, elevation: 199 },
    ],
    climbM: 100,
  },
};

const saveAndRestore = (trip: Trip) => restoreTrip(serialiseTrip(trip));

/** A router that records calls; every call succeeds with a straight line. */
function countingRouter() {
  const calls: LatLng[][] = [];
  const router: Router = {
    async route(_mode, points): Promise<RouteResult> {
      calls.push([...points]);
      return { ok: true, geometry: points.map((p) => ({ ...p, elevation: 0 })) };
    },
  };
  return { router, calls };
}

/** Runs one sync of the auto router over `trip` and returns the trip afterwards and the router calls. */
async function syncOnce(trip: Trip) {
  const { router, calls } = countingRouter();
  let current = trip;
  const auto = createAutoRouter(router, routingInto((change) => (current = change(current))));
  await auto.sync(current);
  return { trip: current, calls };
}

describe("climbM is saved as it is", () => {
  it("a restored routed leg keeps the router's climb, not one recomputed from elevations", () => {
    const trip: Trip = { name: "", points: [A, B], legs: [ROUTED_99_VS_100] };
    const restored = saveAndRestore(trip);
    expect(restored.legs[0]).toEqual(ROUTED_99_VS_100);
    expect(summarise(restored).legs[0].climbM).toBe(100);
    expect(summarise(restored).legs[0].climbM).toBe(summarise(trip).legs[0].climbM);
  });

  it("a fractional or zero climb survives unchanged", () => {
    for (const climbM of [0, 12.5]) {
      const leg = { ...ROUTED_99_VS_100, route: { ...ROUTED_99_VS_100.route!, climbM } } as Trip["legs"][number];
      expect(saveAndRestore({ name: "", points: [A, B], legs: [leg] }).legs[0]).toEqual(leg);
    }
  });
});

describe("undo history is not saved", () => {
  it("a trip with undo steps restores with nothing to undo, and undo on it changes nothing", () => {
    let trip = [A, B, C].reduce<Trip>((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());
    trip = applyEdit(trip, { type: "movePoint", index: 1, to: { lat: 50.27, lng: 5.45 } });
    expect(canUndo(trip)).toBe(true);

    const text = serialiseTrip(trip);
    expect(JSON.parse(text).trip).not.toHaveProperty("undoSteps");
    const restored = restoreTrip(text);
    expect(canUndo(restored)).toBe(false);
    expect(applyEdit(restored, { type: "undo" })).toEqual(restored);
    expect(restored.points).toEqual(trip.points);
  });

  it("undoSteps smuggled into stored data are ignored", () => {
    const valid = JSON.parse(serialiseTrip({ name: "", points: [A, B], legs: [ROUTED_99_VS_100] }));
    valid.trip.undoSteps = [{ name: "", points: [], legs: [] }];
    const parsed = parseTrip(JSON.stringify(valid));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && canUndo(parsed.trip)).toBe(false);
  });
});

describe("a restored trip makes no routing requests", () => {
  it("routed and failed legs are not routed again after a restore", async () => {
    const trip: Trip = {
      name: "Ourthe",
      points: [A, B, C],
      legs: [ROUTED_99_VS_100, { mode: "paddle", route: { status: "failed", failure: { kind: "unavailable" } } }],
    };
    const { trip: after, calls } = await syncOnce(saveAndRestore(trip));
    expect(calls).toHaveLength(0);
    expect(after).toEqual(trip);
  });

  it("a leg that was still pending when saved is routed once after a restore and does not stay pending", async () => {
    const trip: Trip = { name: "", points: [A, B, C], legs: [ROUTED_99_VS_100, { mode: "hike", route: { status: "pending" } }] };
    const { trip: after, calls } = await syncOnce(saveAndRestore(trip));
    expect(calls).toEqual([[B, C]]);
    expect(after.legs[0]).toEqual(ROUTED_99_VS_100);
    expect(after.legs[1].route?.status).toBe("routed");
  });
});

describe("trip name", () => {
  it("is saved and restored, including unusual text", () => {
    for (const name of ["Lesse loop", "", "  spaces  ", 'Quote " and \\ backslash', "Ourthe – été 🛶"]) {
      expect(saveAndRestore(renameTrip(emptyTrip(), name)).name).toBe(name);
    }
  });
});

describe("new trip", () => {
  it("an empty trip saves and restores as an empty trip", () => {
    expect(saveAndRestore(emptyTrip())).toEqual(emptyTrip());
  });
});

describe("corrupt stored data gives an empty trip without throwing", () => {
  const valid = JSON.parse(serialiseTrip({ name: "x", points: [A, B], legs: [ROUTED_99_VS_100] }));
  const variant = (change: (v: typeof valid) => void) => {
    const copy = structuredClone(valid);
    change(copy);
    return JSON.stringify(copy);
  };

  it.each([
    ["undefined as text", "undefined"],
    ["a bare number", "42"],
    ["a bare string", '"packraft-go-trip"'],
    ["truncated JSON", serialiseTrip({ name: "x", points: [A, B], legs: [ROUTED_99_VS_100] }).slice(0, -5)],
    ["an infinite number", JSON.stringify(valid).replace('"lat":50.3527', '"lat":1e999')],
    ["version as text", variant((v) => (v.version = "1"))],
    ["version missing", variant((v) => delete v.version)],
    ["trip is null", variant((v) => (v.trip = null))],
    ["trip is a list", variant((v) => (v.trip = []))],
    ["legs missing", variant((v) => delete v.trip.legs)],
    ["points missing", variant((v) => delete v.trip.points)],
    ["name missing", variant((v) => delete v.trip.name)],
    ["a leg but no points", variant((v) => ((v.trip.points = []), (v.trip.legs = [{ mode: "hike" }])))],
    ["a point that is null", variant((v) => (v.trip.points[0] = null))],
    ["a longitude out of range", variant((v) => (v.trip.points[1].lng = 181))],
    ["a leg that is null", variant((v) => (v.trip.legs[0] = null))],
    ["a leg without a mode", variant((v) => delete v.trip.legs[0].mode)],
    ["a route that is a string", variant((v) => (v.trip.legs[0].route = "routed"))],
    ["geometry that is not a list", variant((v) => (v.trip.legs[0].route.geometry = {}))],
    ["a geometry point with text elevation", variant((v) => (v.trip.legs[0].route.geometry[0].elevation = "100"))],
    ["a climb that is null", variant((v) => (v.trip.legs[0].route.climbM = null))],
    ["a failed route without a failure", variant((v) => (v.trip.legs[0].route = { status: "failed" }))],
  ])("%s", (_, text) => {
    expect(() => restoreTrip(text)).not.toThrow();
    expect(restoreTrip(text)).toEqual(emptyTrip());
    expect(parseTrip(text)).toEqual({ ok: false });
  });

  it("a very large stored trip still restores", () => {
    const points = Array.from({ length: 2000 }, (_, i) => ({ lat: 50 + i * 1e-4, lng: 5 }));
    const trip: Trip = { name: "big", points, legs: points.slice(1).map(() => ({ mode: "hike" as const })) };
    expect(saveAndRestore(trip)).toEqual(trip);
  });
});
