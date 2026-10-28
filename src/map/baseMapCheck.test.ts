import { describe, expect, it } from "vitest";
import { baseMaps, overlays } from "./mapConfig";
import { baseMapCheckRequests, runBaseMapCheck, tileAt, wmsTileUrl } from "./baseMapCheck";

const image = { status: 200, headers: new Headers({ "content-type": "image/png" }) };

describe("base map check (#179)", () => {
  it("finds the tile under a place: the Ourthe at zoom 12 is 2108/1384", () => {
    expect(tileAt(50.25, 5.36, 12)).toEqual({ z: 12, x: 2108, y: 1384 });
  });

  it("asks a WMS for one tile's Web Mercator box", () => {
    const url = new URL(
      wmsTileUrl(
        "https://wms.example/WMSServer",
        { layers: "0", format: "image/png", transparent: true, version: "1.3.0" },
        {
          z: 1,
          x: 0,
          y: 0,
        },
      ),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: "0",
      styles: "",
      format: "image/png",
      transparent: "true",
      crs: "EPSG:3857",
      width: "256",
      height: "256",
      bbox: "-20037508.342789244,0,0,20037508.342789244",
    });
  });

  it("makes one request per source, OpenTopoMap once, each inside its source's bounds", () => {
    const requests = baseMapCheckRequests();
    const sources = new Set([...baseMaps.flatMap((map) => map.sources), ...overlays.map((overlay) => overlay.source)]);
    expect(requests).toHaveLength(sources.size);
    expect(new Set(requests.map((request) => new URL(request.url).hostname)).size).toBe(sources.size);
    for (const request of requests) expect(request.url).not.toMatch(/[{}]/);
    expect(requests.find((request) => request.url.includes("vlaanderen"))?.url).toContain("TILEMATRIX=15&");
  });

  it("also asks the Hiking trails overlay for one tile, after the base maps (ADR 0032)", () => {
    const last = baseMapCheckRequests().at(-1)!;
    expect(last.url).toBe("https://tile.waymarkedtrails.org/hiking/12/2098/1380.png");
    expect(last.label).toBe("Hiking trails: tile.waymarkedtrails.org");
  });

  it("reports OK for every image and passes", async () => {
    const result = await runBaseMapCheck({ fetch: async () => image, wait: async () => {} });
    expect(result.passed).toBe(true);
    expect(result.report.split("\n").filter((line) => line.startsWith("OK"))).toHaveLength(
      baseMapCheckRequests().length,
    );
  });

  it("reports FAILED for an error, a non-image answer or a network failure, and fails", async () => {
    let call = 0;
    const result = await runBaseMapCheck({
      fetch: async () => {
        call++;
        if (call === 1) return { status: 400, headers: new Headers({ "content-type": "text/xml" }) };
        if (call === 2) return { status: 200, headers: new Headers({ "content-type": "text/html" }) };
        if (call === 3) throw new Error("offline");
        return image;
      },
      wait: async () => {},
    });
    expect(result.passed).toBe(false);
    const failed = result.report.split("\n").filter((line) => line.startsWith("FAILED"));
    expect(failed).toHaveLength(3);
    expect(failed[0]).toContain("HTTP 400");
    expect(failed[1]).toContain("text/html");
    expect(failed[2]).toContain("offline");
  });

  it("pauses between requests", async () => {
    const waits: number[] = [];
    await runBaseMapCheck({ fetch: async () => image, wait: async (ms) => void waits.push(ms) });
    expect(waits).toHaveLength(baseMapCheckRequests().length - 1);
    expect(waits.every((ms) => ms >= 1000)).toBe(true);
  });
});
