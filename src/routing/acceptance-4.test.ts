// Acceptance tests for #4, Seam 2: the BRouter adapter fed the committed
// recorded responses. The global fetch is replaced with one that fails the
// test, so any accidental call to the live server is caught.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarise } from "@/core/summarise";
import { applyEdit, emptyTrip, type Trip } from "@/core/trip";
import { createBRouterRouter } from "./brouter";

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");

const FROM = { lat: 50.3527, lng: 5.4561 };
const TO = { lat: 50.344, lng: 5.47 };

function recorded(body: string, status = 200) {
  const urls: URL[] = [];
  return {
    urls,
    fetch: async (input: string) => {
      urls.push(new URL(input));
      return new Response(body, { status });
    },
  };
}

let liveCalls: string[];
beforeEach(() => {
  liveCalls = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    liveCalls.push(String(input));
    throw new Error("test tried to reach the network");
  });
});
afterEach(() => {
  expect(liveCalls).toEqual([]);
  vi.unstubAllGlobals();
});

describe("#4 AC6: recorded BRouter fixtures are committed", () => {
  it("has a hiking success fixture and a failure/no-route fixture", () => {
    const files = readdirSync(FIXTURES);
    const success = JSON.parse(fixture("hiking-success.geojson"));
    expect(success.type).toBe("FeatureCollection");
    expect(success.features[0].geometry.type).toBe("LineString");
    expect(success.features[0].geometry.coordinates.length).toBeGreaterThan(2);
    expect(files.some((f) => /no-route|error|fail/.test(f))).toBe(true);
  });
});

describe("#4 AC1 + AC7: adapter converts recorded BRouter GeoJSON", () => {
  it("asks for the hiking profile with lng,lat pairs and returns lat/lng/elevation points", async () => {
    const r = recorded(fixture("hiking-success.geojson"));
    const result = await createBRouterRouter({ fetch: r.fetch }).route("hike", [FROM, TO]);

    expect(r.urls).toHaveLength(1);
    expect(r.urls[0].searchParams.get("profile")).toMatch(/hiking/);
    expect(r.urls[0].searchParams.get("format")).toBe("geojson");
    const [a, b] = (r.urls[0].searchParams.get("lonlats") ?? "").split("|").map((p) => p.split(",").map(Number));
    expect(a).toEqual([FROM.lng, FROM.lat]);
    expect(b).toEqual([TO.lng, TO.lat]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = JSON.parse(fixture("hiking-success.geojson")).features[0].geometry.coordinates as number[][];
    expect(result.geometry).toHaveLength(raw.length);
    result.geometry.forEach((p, i) => {
      expect(p).toEqual({ lng: raw[i][0], lat: raw[i][1], elevation: raw[i][2] });
    });
    // Starts and ends near the requested points (Belgium, lat ~50, lng ~5).
    expect(result.geometry[0].lat).toBeCloseTo(FROM.lat, 2);
    expect(result.geometry.at(-1)!.lng).toBeCloseTo(TO.lng, 2);
  });

  it("the recorded track's figures roughly match BRouter's own track length", async () => {
    const r = recorded(fixture("hiking-success.geojson"));
    const result = await createBRouterRouter({ fetch: r.fetch }).route("hike", [FROM, TO]);
    if (!result.ok) throw new Error("expected a route");
    const base = [FROM, TO].reduce((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());
    const trip: Trip = { ...base, legs: [{ mode: "hike", route: { status: "routed", geometry: result.geometry } }] };
    const props = JSON.parse(fixture("hiking-success.geojson")).features[0].properties;
    const leg = summarise(trip).legs[0];
    expect(leg.distanceKm * 1000).toBeGreaterThan(Number(props["track-length"]) * 0.97);
    expect(leg.distanceKm * 1000).toBeLessThan(Number(props["track-length"]) * 1.03);
    expect(leg.climbM).toBeGreaterThan(0);
    expect(leg.descentM).toBeGreaterThan(0);
  });

  it("maps the recorded 400 routing error to no-route", async () => {
    const r = recorded(fixture("hiking-no-route-400.txt"), 400);
    expect(await createBRouterRouter({ fetch: r.fetch }).route("hike", [FROM, TO])).toEqual({
      ok: false,
      failure: { kind: "no-route" },
    });
  });

  it.each([
    ["503 service unavailable", "", 503],
    ["429 rate limited", "too many requests", 429],
    ["empty 200 body", "", 200],
    ["JSON that is not a route", '{"hello":"world"}', 200],
    ["FeatureCollection with no features", '{"type":"FeatureCollection","features":[]}', 200],
  ])("never throws and gives a typed failure for %s", async (_name, body, status) => {
    const r = recorded(body, status);
    const result = await createBRouterRouter({ fetch: r.fetch }).route("hike", [FROM, TO]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["no-route", "unavailable"]).toContain(result.failure.kind);
  });

  it("fills a point without elevation from its neighbour rather than dropping or zeroing it", async () => {
    const body = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.0, 50.0, 100],
              [5.001, 50.001],
              [5.002, 50.002, 110],
            ],
          },
        },
      ],
    });
    const result = await createBRouterRouter({ fetch: recorded(body).fetch }).route("hike", [FROM, TO]);
    if (!result.ok) throw new Error("expected a route");
    expect(result.geometry).toHaveLength(3);
    expect(result.geometry[1].elevation).toBe(100);
  });
});
