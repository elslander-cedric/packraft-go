// Seam 3: checks on the built-in access data (ADR 0024). Every record must say
// where its rule comes from and when it was researched, and the geometry must
// put the known waters where they are.
import { describe, expect, it } from "vitest";
import { accessAt, type AccessRecord, type Geometry } from "@/core/access";
import { builtInAccessRules, builtInDatasets } from "./builtInRules";
import { ACCESS_DATA_FORMAT } from "./dataset";

const records = builtInDatasets.flatMap((dataset) => dataset.records);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every position, to check it lies roughly in the country (lng 2.5–6.5, lat 49.4–51.6). */
function positions(geometry: Geometry): (readonly [number, number])[] {
  switch (geometry.type) {
    case "LineString":
      return [...geometry.coordinates];
    case "MultiLineString":
      return geometry.coordinates.flat();
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
  }
}

function geometryProblems(record: AccessRecord): string[] {
  const g = record.geometry;
  const problems: string[] = [];
  const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  const rings = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
  if (record.scope === "region" && rings.length === 0) problems.push("a region needs an area");
  if (lines.some((line) => line.length < 2)) problems.push("a line with fewer than 2 positions");
  const closed = (ring: (typeof rings)[number]) =>
    ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  if (!rings.every(closed)) problems.push("a ring that isn't closed");
  if (positions(g).length === 0) problems.push("no positions");
  if (!positions(g).every(([lng, lat]) => lng > 2.5 && lng < 6.5 && lat > 49.4 && lat < 51.6)) {
    problems.push("positions outside the country");
  }
  return problems.map((p) => `${record.id}: ${p}`);
}

const at = (lat: number, lng: number) => accessAt({ lat, lng }, builtInAccessRules, { date: "2026-10-12" });
const ruleIds = (status: ReturnType<typeof at>) => status.reasons.map((r) => (r.kind === "rule" ? r.recordId : r.kind));

describe("built-in access data", () => {
  it("every dataset is format version 1 and credits OpenStreetMap", () => {
    expect(builtInDatasets.map((d) => d.id)).toEqual(["regions", "flanders"]);
    for (const dataset of builtInDatasets) {
      expect(dataset.format).toBe(ACCESS_DATA_FORMAT);
      expect(dataset.version).toBe(1);
      expect(dataset.attribution).toMatch(/OpenStreetMap.*ODbL/);
      expect(dataset.extracted).toMatch(DATE);
    }
  });

  it("every record has a source and a research date", () => {
    const missing = records.filter(
      (r) => !r.source?.title || !/^https:\/\//.test(r.source?.url ?? "") || !DATE.test(r.researched ?? ""),
    );
    expect(missing.map((r) => r.id)).toEqual([]);
  });

  it("every record has a unique id, a name, a rule with a reason, and a valid geometry", () => {
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
    for (const record of records) {
      expect(record.name, record.id).not.toBe("");
      expect(["region", "water"], record.id).toContain(record.scope);
      expect(record.rule.text, record.id).not.toBe("");
    }
    expect(records.flatMap(geometryProblems)).toEqual([]);
  });

  it("has the three regions, with Brussels cut out of Flanders", () => {
    expect(records.filter((r) => r.scope === "region").map((r) => r.id)).toEqual(["flanders", "wallonia", "brussels"]);
    expect(ruleIds(at(51.054, 3.722))).toEqual(["flanders"]); // Ghent
    expect(ruleIds(at(50.466, 4.867))).toEqual(["wallonia"]); // Namur
    expect(ruleIds(at(50.846, 4.352))).toEqual(["brussels"]); // Brussels, Grand-Place
  });

  it("lists the Flemish exceptions as forbidden, each with its reason", () => {
    const forbidden = records.filter((r) => r.region === "flanders" && r.rule.state === "forbidden").map((r) => r.id);
    expect(forbidden).toEqual([
      "flanders-ghent-terneuzen-canal",
      "flanders-lower-sea-scheldt",
      "flanders-bruges-reien",
      "flanders-lier-nete-diversion",
      "flanders-port-antwerp",
      "flanders-port-ghent",
      "flanders-port-zeebrugge",
    ]);
  });

  it.each([
    ["the Ghent–Terneuzen canal at Zelzate", 51.2, 3.8115, "flanders-ghent-terneuzen-canal"],
    ["the Groenerei in Bruges", 51.20866, 3.2292, "flanders-bruges-reien"],
    ["the Churchilldok in the port of Antwerp", 51.2806, 4.3667, "flanders-port-antwerp"],
  ])("water on %s is forbidden", (_, lat, lng, id) => {
    const status = at(lat, lng);
    expect(status.state).toBe("forbidden");
    expect(ruleIds(status)).toContain(id);
  });

  it("the Leie at Deinze, not an exception, is open by default", () => {
    const status = at(50.9845, 3.5311);
    expect(status.state).toBe("open");
    expect(ruleIds(status)).toEqual(["flanders"]);
  });

  it("VMM agreement stretches are open with their text rules and a link", () => {
    const vmm = records.filter((r) => r.id.startsWith("flanders-vmm-"));
    expect(vmm.map((r) => r.id)).toEqual([
      "flanders-vmm-kleine-nete",
      "flanders-vmm-dijle",
      "flanders-vmm-zenne",
      "flanders-vmm-stekene-zuidlede",
    ]);
    for (const record of vmm) {
      expect(record.rule.state, record.id).toBe("open");
      expect(record.rule.conditions?.length, record.id).toBeGreaterThan(0);
      expect(record.rule.link?.url, record.id).toMatch(/^https:\/\//);
    }
  });
});
