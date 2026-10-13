// Seam 3: building access records from saved Overpass answers (no network).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { geometryQuery, waterRecord, type Overpass } from "./build";
import type { OverpassResponse, Polygon } from "./osm";
import { serialiseDataset } from "./serialise";
import { flandersWaterSpecs, type WaterSpec } from "./sources";

const extract = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as OverpassResponse;

/** Answers with one saved extract and remembers the queries. */
function saved(answer: OverpassResponse) {
  const queries: string[] = [];
  const overpass: Overpass = async (query) => {
    queries.push(query);
    return answer;
  };
  return { overpass, queries };
}

/** A generous square around Lier, standing in for the Flanders boundary. */
const aroundLier: Polygon[] = [
  [
    [
      [4.4, 51.0],
      [4.8, 51.0],
      [4.8, 51.3],
      [4.4, 51.3],
      [4.4, 51.0],
    ],
  ],
];

const lierSpec = flandersWaterSpecs.find((s) => s.id === "flanders-lier-nete-diversion")!;

describe("building a water record", () => {
  it("asks Overpass for the spec's objects with their geometry", async () => {
    const { overpass, queries } = saved(extract("lier-nete-diversion.json"));
    await waterRecord(lierSpec, aroundLier, overpass);
    expect(queries).toEqual([geometryQuery(lierSpec.query)]);
    expect(queries[0]).toMatch(/out geom;$/);
  });

  it("turns the saved Lier extract into a simplified, rounded line with the rule, source and research date", async () => {
    const record = await waterRecord(lierSpec, aroundLier, saved(extract("lier-nete-diversion.json")).overpass);
    expect(record).toMatchObject({
      id: "flanders-lier-nete-diversion",
      scope: "water",
      region: "flanders",
      rule: { type: "fixed", state: "forbidden" },
      source: { url: "https://www.visuris.be/kano" },
      researched: "2026-10-12",
    });
    expect(record.geometry.type).toBe("LineString");
    const line = record.geometry.type === "LineString" ? record.geometry.coordinates : [];
    const raw = extract("lier-nete-diversion.json").elements.flatMap((e) => (e.type === "way" ? (e.geometry ?? []) : []));
    expect(line.length).toBeGreaterThanOrEqual(2);
    expect(line.length).toBeLessThan(raw.length);
    for (const [lng, lat] of line) {
      expect(Math.round(lng * 1e5)).toBeCloseTo(lng * 1e5, 6);
      expect(Math.round(lat * 1e5)).toBeCloseTo(lat * 1e5, 6);
    }
  });

  it("drops the parts outside the region", async () => {
    // A boundary that only covers the western half of the channel.
    const westOnly: Polygon[] = [
      [
        [
          [4.4, 51.0],
          [4.5625, 51.0],
          [4.5625, 51.3],
          [4.4, 51.3],
          [4.4, 51.0],
        ],
      ],
    ];
    const record = await waterRecord(lierSpec, westOnly, saved(extract("lier-nete-diversion.json")).overpass);
    const lines = record.geometry.type === "LineString" ? [record.geometry.coordinates] : record.geometry.type === "MultiLineString" ? record.geometry.coordinates : [];
    expect(lines.flat().every(([lng]) => lng <= 4.5625)).toBe(true);
  });

  it("keeps only the part between the spec's end points", async () => {
    const answer = extract("lier-nete-diversion.json");
    const whole = await waterRecord(lierSpec, aroundLier, saved(answer).overpass);
    const wholeLine = whole.geometry.type === "LineString" ? whole.geometry.coordinates : [];
    // Two places on the channel, a third and two thirds of the way along it.
    const from = wholeLine[Math.floor(wholeLine.length / 3)];
    const to = wholeLine[Math.floor((2 * wholeLine.length) / 3)];
    const spec: WaterSpec = { ...lierSpec, between: { from, to } };
    const record = await waterRecord(spec, aroundLier, saved(answer).overpass);
    const line = record.geometry.type === "LineString" ? record.geometry.coordinates : [];
    const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0005;
    const ends = [line[0], line[line.length - 1]];
    expect(ends.some((end) => near(end, from))).toBe(true);
    expect(ends.some((end) => near(end, to))).toBe(true);
    expect(line.length).toBeLessThan(wholeLine.length);
  });

  it("refuses to build a water with no geometry, rather than shipping an empty record", async () => {
    await expect(waterRecord(lierSpec, aroundLier, saved({ elements: [] }).overpass)).rejects.toThrow(/no lines/);
  });
});

describe("serialising a dataset", () => {
  it("round-trips through JSON with each geometry on one line", () => {
    const dataset = {
      format: "packraft-go/access-data" as const,
      version: 1 as const,
      id: "test",
      title: "Test",
      attribution: "Geometry © OpenStreetMap contributors, ODbL",
      extracted: "2026-10-12",
      records: [
        {
          id: "a",
          name: "A",
          scope: "water" as const,
          region: "flanders",
          rule: { type: "fixed" as const, state: "forbidden" as const, text: "No." },
          geometry: { type: "LineString" as const, coordinates: [[4, 51], [4.1, 51]] as [number, number][] },
          source: { title: "S", url: "https://example.org" },
          researched: "2026-10-12",
        },
      ],
    };
    const text = serialiseDataset(dataset);
    expect(JSON.parse(text)).toEqual(dataset);
    expect(text).toContain('"geometry": {"type":"LineString","coordinates":[[4,51],[4.1,51]]}');
  });
});
