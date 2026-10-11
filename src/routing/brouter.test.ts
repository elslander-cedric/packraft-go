// Seam 2: the BRouter adapter, fed recorded responses (never the live server, ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBRouterRouter } from "./brouter";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const START = { lat: 50.3527, lng: 5.4561 };
const END = { lat: 50.344, lng: 5.47 };

/** A fetch that answers every request with one recorded response and remembers the URLs. */
function replay(body: string, status = 200) {
  const urls: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(body, { status });
  };
  return { fetch, urls };
}

describe("BRouter adapter: hike legs", () => {
  it("converts a recorded hiking track into routed points with elevations", async () => {
    const { fetch } = replay(fixture("hiking-success.geojson"));
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.geometry).toHaveLength(159);
    expect(result.geometry[0]).toEqual({ lat: 50.352699, lng: 5.456097, elevation: 161.25 });
    expect(result.geometry[158]).toEqual({ lat: 50.343913, lng: 5.470053, elevation: 201 });
  });

  it("asks the public server for the hiking profile through the leg's points, lng before lat", async () => {
    const { fetch, urls } = replay(fixture("hiking-success.geojson"));
    await createBRouterRouter({ fetch }).route("hike", [START, END]);

    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe("https://brouter.de/brouter");
    expect(url.searchParams.get("lonlats")).toBe("5.4561,50.3527|5.47,50.344");
    expect(url.searchParams.get("profile")).toBe("hiking-mountain");
    expect(url.searchParams.get("format")).toBe("geojson");
  });

  it("uses elevation 0 when BRouter has no height data for the track", async () => {
    // Recorded ferry track: BRouter omits the elevation of both points.
    const { fetch } = replay(fixture("hiking-missing-elevation.geojson"));
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);

    expect(result).toEqual({
      ok: true,
      geometry: [
        { lat: 51.911879, lng: 2.437514, elevation: 0 },
        { lat: 51.913537, lng: 2.459185, elevation: 0 },
      ],
    });
  });

  it("reports no-route when BRouter answers with a routing error (HTTP 400)", async () => {
    const { fetch } = replay(fixture("hiking-no-route-400.txt"), 400);
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);
    expect(result).toEqual({ ok: false, failure: { kind: "no-route" } });
  });

  it("reports no-route when the recorded track has fewer than two points", async () => {
    const { fetch } = replay(fixture("hiking-no-route-single-point.geojson"));
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);
    expect(result).toEqual({ ok: false, failure: { kind: "no-route" } });
  });

  it("reports unavailable when the server fails", async () => {
    const { fetch } = replay("", 500);
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);
    expect(result).toEqual({ ok: false, failure: { kind: "unavailable" } });
  });

  it("reports unavailable when the network request throws", async () => {
    const fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);
    expect(result).toEqual({ ok: false, failure: { kind: "unavailable" } });
  });

  it("reports unavailable when the response is not GeoJSON", async () => {
    const { fetch } = replay("<html>maintenance</html>");
    const result = await createBRouterRouter({ fetch }).route("hike", [START, END]);
    expect(result).toEqual({ ok: false, failure: { kind: "unavailable" } });
  });
});
