// Acceptance tests for #3 (draw a route as straight lines), written from
// the issue's acceptance criteria. They use only the core's public
// interface (Seam 1): build a trip with edits, then read the trip and its figures.
import { describe, expect, it } from "vitest";
import type { Router, RouteResult } from "./router";
import { summarise } from "./summarise";
import { createFakeRouter } from "./testing/fakeRouter";
import { applyEdit, emptyTrip, type LatLng, type Trip } from "./trip";

const add = (trip: Trip, at: LatLng) => applyEdit(trip, { type: "addPoint", at });
const through = (...points: LatLng[]) => points.reduce(add, emptyTrip());

// Independent reference: spherical law of cosines on a 6371 km sphere.
function referenceKm(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const c =
    Math.sin(a.lat * r) * Math.sin(b.lat * r) +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return 6371 * Math.acos(Math.min(1, Math.max(-1, c)));
}

// Real places in Belgium (Ardennes, around the Ourthe).
const DURBUY = { lat: 50.3527, lng: 5.4561 };
const HOTTON = { lat: 50.2678, lng: 5.4469 };
const LA_ROCHE = { lat: 50.1833, lng: 5.5756 };

describe("AC1: first click places the start; each further click adds a point and a hike leg", () => {
  it("an empty trip has no points and no legs", () => {
    expect(emptyTrip().points).toHaveLength(0);
    expect(emptyTrip().legs).toHaveLength(0);
  });

  it("n points give n - 1 legs, all hike, connecting consecutive points", () => {
    let trip = emptyTrip();
    const pts = [DURBUY, HOTTON, LA_ROCHE, DURBUY, HOTTON];
    pts.forEach((p, i) => {
      trip = add(trip, p);
      expect(trip.points).toHaveLength(i + 1);
      expect(trip.legs).toHaveLength(i);
      expect(trip.legs.every((leg) => leg.mode === "hike")).toBe(true);
    });
    expect(trip.points).toEqual(pts);
  });

  it("adding a point never mutates the trip it was given", () => {
    const one = through(DURBUY);
    const snapshot = JSON.stringify(one);
    const two = add(one, HOTTON);
    expect(JSON.stringify(one)).toBe(snapshot);
    expect(two).not.toBe(one);
  });

  it("adding the same spot twice still adds a (zero-length) leg without crashing", () => {
    const trip = through(DURBUY, DURBUY);
    expect(trip.legs).toHaveLength(1);
    expect(summarise(trip).legs[0].distanceKm).toBe(0);
  });
});

describe("AC3: figures give each leg's distance and the trip total", () => {
  it("leg distances match an independent great-circle reference within 0.1%", () => {
    const summary = summarise(through(DURBUY, HOTTON, LA_ROCHE));
    expect(summary.legs).toHaveLength(2);
    const expected = [referenceKm(DURBUY, HOTTON), referenceKm(HOTTON, LA_ROCHE)];
    summary.legs.forEach((leg, i) => {
      expect(leg.mode).toBe("hike");
      expect(Math.abs(leg.distanceKm - expected[i]) / expected[i]).toBeLessThan(0.001);
    });
  });

  it("the trip total is the sum of the leg distances", () => {
    const summary = summarise(through(DURBUY, HOTTON, LA_ROCHE, DURBUY));
    const sum = summary.legs.reduce((s, leg) => s + leg.distanceKm, 0);
    expect(summary.trip.distanceKm).toBeCloseTo(sum, 9);
  });

  it("a leg's distance does not depend on direction", () => {
    const there = summarise(through(DURBUY, LA_ROCHE)).trip.distanceKm;
    const back = summarise(through(LA_ROCHE, DURBUY)).trip.distanceKm;
    expect(there).toBeCloseTo(back, 9);
  });

  it("a leg across the antimeridian is measured the short way round", () => {
    const km = summarise(through({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).trip.distanceKm;
    expect(km).toBeCloseTo(referenceKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 }), 0);
    expect(km).toBeLessThan(200);
  });

  it("figures follow the trip: adding a point adds a leg to the figures", () => {
    const before = summarise(through(DURBUY, HOTTON));
    const after = summarise(through(DURBUY, HOTTON, LA_ROCHE));
    expect(after.legs).toHaveLength(before.legs.length + 1);
    expect(after.trip.distanceKm).toBeGreaterThan(before.trip.distanceKm);
  });
});

describe("AC5: router interface with a fake for tests", () => {
  const routed: RouteResult = {
    ok: true,
    geometry: [
      { ...DURBUY, elevation: 190 },
      { lat: 50.31, lng: 5.45, elevation: 205 },
      { ...HOTTON, elevation: 180 },
    ],
  };

  it("routes a leg of a mode through points to geometry with elevations", async () => {
    const router: Router = createFakeRouter({ hike: routed });
    const result = await router.route("hike", [DURBUY, HOTTON]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.geometry.length).toBeGreaterThan(1);
      for (const p of result.geometry) expect(typeof p.elevation).toBe("number");
    }
  });

  it("returns a typed failure instead of throwing", async () => {
    const unavailable = createFakeRouter({ paddle: { ok: false, failure: { kind: "unavailable" } } });
    await expect(unavailable.route("paddle", [DURBUY, HOTTON])).resolves.toEqual({
      ok: false,
      failure: { kind: "unavailable" },
    });
    const noResult = createFakeRouter({});
    const r = await noResult.route("hike", [DURBUY, HOTTON]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["no-route", "unavailable"]).toContain(r.failure.kind);
  });

  it("answers per mode", async () => {
    const router = createFakeRouter({ hike: routed });
    expect((await router.route("hike", [DURBUY, HOTTON])).ok).toBe(true);
    expect((await router.route("paddle", [DURBUY, HOTTON])).ok).toBe(false);
  });
});

describe("AC4: trip planner core has no React or network dependencies", () => {
  it("every import in src/core resolves inside src/core (no React, Leaflet, UI or map modules)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const f = path.join(dir, n);
        return statSync(f).isDirectory() ? walk(f) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [f] : [];
      });
    const offenders: string[] = [];
    for (const file of walk(__dirname)) {
      const code = readFileSync(file, "utf8");
      for (const m of code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const spec = m[1];
        const inside =
          spec.startsWith(".") && path.resolve(path.dirname(file), spec).startsWith(__dirname + path.sep);
        if (!inside) offenders.push(`${path.relative(__dirname, file)} -> ${spec}`);
      }
      if (/\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document)\b/.test(code)) {
        offenders.push(`${path.relative(__dirname, file)} uses a browser/network global`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
