// Seam 3: checks on the built-in access data (ADR 0024). Every record must say
// where its rule comes from and when it was researched, and the geometry must
// put the known waters where they are.
import { describe, expect, it } from "vitest";
import { accessAt, type AccessRecord, type Geometry } from "@/core/access";
import { builtInAccessRules, builtInDatasets, builtInLocks } from "./builtInRules";
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
    expect(builtInDatasets.map((d) => d.id)).toEqual(["regions", "flanders", "brussels"]);
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
    ["the Ghent–Terneuzen canal at Zelzate", 51.195, 3.8019, "flanders-ghent-terneuzen-canal"],
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

  describe("Brussels (#57)", () => {
    const brussels = records.filter((r) => r.region === "brussels" && r.scope === "water");

    it("has the canal, the ponds, the Senne and the small streams", () => {
      expect(brussels.map((r) => r.id)).toEqual(["brussels-canal", "brussels-ponds", "brussels-senne", "brussels-streams"]);
    });

    it("gives the canal as open, with the priority, VHF and Capitainerie notes", () => {
      const canal = brussels.find((r) => r.id === "brussels-canal")!;
      expect(canal.rule.state).toBe("open");
      const notes = (canal.rule.conditions ?? []).join(" ");
      expect(notes).toMatch(/commercial/i);
      expect(notes).toMatch(/VHF/);
      expect(notes).toContain("+32 2 247 91 21");
      expect(canal.unverified).toBeTruthy();
    });

    it("gives the ponds as forbidden without permission, and the Senne and small streams as unknown", () => {
      const state = (id: string) => brussels.find((r) => r.id === id)!.rule.state;
      expect(state("brussels-ponds")).toBe("forbidden");
      expect(state("brussels-senne")).toBe("unknown");
      expect(state("brussels-streams")).toBe("unknown");
    });

    it("finds the canal open and a pond in Ixelles forbidden", () => {
      const canal = at(50.8636, 4.3499); // the canal near Sainctelette
      expect(canal.state).toBe("open");
      expect(ruleIds(canal)).toContain("brussels-canal");
      const pond = at(50.8264, 4.3715); // Étangs d'Ixelles
      expect(pond.state).toBe("forbidden");
      expect(ruleIds(pond)).toContain("brussels-ponds");
    });

    it("leaves other Brussels places to the region's unknown default", () => {
      expect(at(50.8465, 4.3524).state).toBe("unknown"); // Grand-Place
    });
  });

  describe("lock markers (#57)", () => {
    it("have a source and a research date, a unique id and a position in their region", () => {
      const missing = builtInLocks.locks.filter(
        (l) => !l.source?.title || !/^https:\/\//.test(l.source?.url ?? "") || !DATE.test(l.researched ?? ""),
      );
      expect(missing.map((l) => l.id)).toEqual([]);
      expect(new Set(builtInLocks.locks.map((l) => l.id)).size).toBe(builtInLocks.locks.length);
      // Against the region records alone: on a canal, the canal's own rule would hide the region.
      const regionsOnly = { records: records.filter((r) => r.scope === "region") };
      for (const lock of builtInLocks.locks) {
        const [lng, lat] = lock.position;
        const status = accessAt({ lat, lng }, regionsOnly, { date: "2026-10-12" });
        expect(ruleIds(status), lock.id).toContain(lock.region);
      }
      expect(builtInLocks.attribution).toMatch(/OpenStreetMap.*ODbL/);
    });

    it("include the Anderlecht and Molenbeek locks in Brussels, and many in Flanders", () => {
      const brusselsLocks = builtInLocks.locks.filter((l) => l.region === "brussels").map((l) => l.name);
      expect(brusselsLocks.some((n) => /Anderlecht/.test(n))).toBe(true);
      expect(brusselsLocks.some((n) => /Molenbeek/.test(n))).toBe(true);
      expect(builtInLocks.locks.filter((l) => l.region === "flanders").length).toBeGreaterThan(30);
    });
  });
});
