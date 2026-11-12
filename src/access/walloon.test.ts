// Seam 3: the Walloon stretches as access records, evaluated with the shipped data.
import { describe, expect, it } from "vitest";
import { accessAt, accessFeatures } from "@/core/access";
import { builtInAccessRules } from "./builtInRules";
import { walloonDataset } from "./walloon";
import stretches from "@/data/walloon-stretches.json";

const dataset = walloonDataset(stretches as unknown as Parameters<typeof walloonDataset>[0]);
const walloon = dataset.records;

describe("Walloon stretch records", () => {
  it("has the 28 reviewed stretches, 4 of them split in two (#209), each with a source and research date", () => {
    expect(walloon).toHaveLength(32);
    for (const record of walloon) {
      expect(record.scope).toBe("water");
      expect(record.source.url).toMatch(/^https:\/\//);
      expect(record.researched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.geometry.type).toBe("LineString");
    }
  });

  it("keeps the assumed flag on the gauges, and says so as not confirmed", () => {
    const assumed = walloon.filter((record) => record.rule.type === "agw" && record.rule.gauge?.assumed);
    const names = new Set(assumed.map((record) => (record.rule.type === "agw" ? record.rule.gauge?.name : "")));
    expect(names).toEqual(new Set(["Martinrive", "Gendron", "Martelange", "Membre"]));
    for (const record of assumed) {
      expect(record.unverified).toMatch(/assumed/);
    }
  });

  it("the Lesse from Han to Houyet keeps Hérock's SPW practice mark on its rule, as a confirmed gauge (#205)", () => {
    for (const piece of ["walloon-1C2b-1", "walloon-1C2b-2"]) {
      const lesse = walloon.find((record) => record.id === piece)!;
      expect(lesse.rule).toMatchObject({
        gauge: { name: "Hérock", stationNo: "L6610", assumed: false, spwPractice: true },
      });
      expect(lesse.unverified).toBeUndefined();
    }
  });
});

describe("official stretch ids", () => {
  const ruleOf = (over: object) => {
    const stretch = {
      id: "1X1",
      category: "1.A",
      river: "Test",
      from: { en: "a" },
      to: { en: "b" },
      line: [
        [5, 50],
        [5.1, 50],
      ],
      gauge: null,
      minM3s: null,
      maxM3s: 10,
      researchDate: "2026-10-12",
      ...over,
    };
    const data = { researchDate: "2026-10-12", sources: { annex1: "https://example.org" }, stretches: [stretch] };
    return walloonDataset(data as unknown as Parameters<typeof walloonDataset>[0]).records[0]!.rule;
  };

  it("carries a stretch's official stretch onto its rule (#209)", () => {
    expect(ruleOf({ officialStretch: "SEMOIS2-3" })).toMatchObject({ officialStretch: "SEMOIS2-3" });
  });

  it("leaves it out for a stretch the SPW doesn't list (#209)", () => {
    expect(ruleOf({})).not.toHaveProperty("officialStretch");
  });
});

describe("the Walloon stretches in the built-in rules", () => {
  const on = (id: string) => {
    const record = walloon.find((record) => record.id === id)!;
    const line = record.geometry.type === "LineString" ? record.geometry.coordinates : [];
    const [lng, lat] = line[Math.floor(line.length / 2)];
    return { lat, lng };
  };
  const stateOn = (id: string, date: string) => accessAt(on(id), builtInAccessRules, { date });

  it("the Semois from Chassepierre to Linglé follows SEMOIS2-3, the SPW's stretch (#210)", () => {
    const today = "2026-11-02";
    const official = { status: "ok", stretches: { "SEMOIS2-3": { code: "3" }, "SEMOIS4-5": { code: "1" } } } as const;
    for (const id of ["walloon-1B4c", "walloon-1A4-1"]) {
      expect(accessAt(on(id), builtInAccessRules, { date: today, today, official }).state).toBe("closed-today");
    }
  });

  it("every stretch is in the built-in rules and drawn as a feature", () => {
    const ids = accessFeatures(builtInAccessRules, { date: "2026-12-15" }).map(
      (accessFeature) => accessFeature.record.id,
    );
    for (const record of walloon) {
      expect(ids).toContain(record.id);
    }
  });

  it("a 1.C stretch is closed for the season in July and open in December", () => {
    const record = walloon.find(
      (otherRecord) => otherRecord.rule.type === "agw" && otherRecord.rule.category === "1.C",
    )!;
    expect(stateOn(record.id, "2026-07-15").state).toBe("closed-today");
    expect(stateOn(record.id, "2026-07-15").reasons[0]).toMatchObject({ closedBy: "season", recordId: record.id });
    expect(stateOn(record.id, "2026-12-15").state).toBe("open");
  });

  it("a 1.B stretch is closed on the trout opening day, 21 March 2026, and open the week after", () => {
    const recordB = walloon.find((record) => record.rule.type === "agw" && record.rule.category === "1.B")!;
    expect(stateOn(recordB.id, "2026-03-21").reasons[0]).toMatchObject({ closedBy: "fishing-day" });
    expect(stateOn(recordB.id, "2026-03-28").state).toBe("open");
  });

  it("a 1.A stretch is open on the first Saturday of June", () => {
    const recordA = walloon.find((record) => record.rule.type === "agw" && record.rule.category === "1.A")!;
    expect(stateOn(recordA.id, "2026-06-06").state).toBe("open");
  });

  // Updated: round 2 (#59): unlisted Walloon water is forbidden (ADR 0022), not unknown. Regions are never painted.
  it("Walloon water on no listed stretch is forbidden: not on the AGW list", () => {
    // The Meuse at Namur is navigable but not in Annex 1 of the AGW.
    const status = accessAt({ lat: 50.4655, lng: 4.8665 }, builtInAccessRules, { date: "2026-12-15" });
    expect(status.state).toBe("forbidden");
    expect(status.reasons[0]).toMatchObject({ recordId: "wallonia", state: "forbidden" });
    expect(status.reasons[0].kind === "rule" && status.reasons[0].ruleText).toMatch(
      /Not on the AGW list of open stretches/,
    );
  });

  it("a point on an unlisted Walloon river (the Meuse at Dinant) is forbidden with that reason", () => {
    const status = accessAt({ lat: 50.2615, lng: 4.9127 }, builtInAccessRules, { date: "2026-07-15" });
    expect(status.state).toBe("forbidden");
    expect(status.reasons).toEqual([
      expect.objectContaining({
        recordId: "wallonia",
        ruleText: expect.stringContaining("Not on the AGW list of open stretches"),
      }),
    ]);
  });

  it("regions are never painted, so unlisted water stays unpainted", () => {
    const ids = accessFeatures(builtInAccessRules, { date: "2026-07-15" }).map(
      (accessFeature) => accessFeature.record.id,
    );
    expect(ids).not.toContain("wallonia");
  });
});
