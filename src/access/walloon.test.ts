// Seam 3: the Walloon stretches as access records, evaluated with the shipped data.
import { describe, expect, it } from "vitest";
import { accessAt, accessFeatures } from "@/core/access";
import { builtInAccessRules } from "./builtInRules";
import { walloonDataset } from "./walloon";
import stretches from "@/data/walloon-stretches.json";

const dataset = walloonDataset(stretches as unknown as Parameters<typeof walloonDataset>[0]);
const walloon = dataset.records;

describe("Walloon stretch records", () => {
  it("has the 28 reviewed stretches, each with a source and research date", () => {
    expect(walloon).toHaveLength(28);
    for (const r of walloon) {
      expect(r.scope).toBe("water");
      expect(r.source.url).toMatch(/^https:\/\//);
      expect(r.researched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.geometry.type).toBe("LineString");
    }
  });

  it("keeps the assumed flag on the gauges, and says so as not confirmed", () => {
    const assumed = walloon.filter((r) => r.rule.type === "agw" && r.rule.gauge?.assumed);
    const names = new Set(assumed.map((r) => (r.rule.type === "agw" ? r.rule.gauge?.name : "")));
    expect(names).toEqual(new Set(["Martinrive", "Gendron", "Martelange", "Membre"]));
    for (const r of assumed) expect(r.unverified).toMatch(/assumed/);
  });

  it("Wanlin has no gauge and says so", () => {
    const wanlin = walloon.find((r) => r.id === "walloon-1C2b")!;
    expect(wanlin.rule).toMatchObject({ gauge: null });
    expect(wanlin.unverified).toBeTruthy();
  });
});

describe("the Walloon stretches in the built-in rules", () => {
  const on = (id: string) => {
    const record = walloon.find((r) => r.id === id)!;
    const line = record.geometry.type === "LineString" ? record.geometry.coordinates : [];
    const [lng, lat] = line[Math.floor(line.length / 2)];
    return { lat, lng };
  };
  const stateOn = (id: string, date: string) => accessAt(on(id), builtInAccessRules, { date });

  it("every stretch is in the built-in rules and drawn as a feature", () => {
    const ids = accessFeatures(builtInAccessRules, { date: "2026-12-15" }).map((f) => f.record.id);
    for (const r of walloon) expect(ids).toContain(r.id);
  });

  it("a 1.C stretch is closed for the season in July and open in December", () => {
    const c = walloon.find((r) => r.rule.type === "agw" && r.rule.category === "1.C")!;
    expect(stateOn(c.id, "2026-07-15").state).toBe("closed-today");
    expect(stateOn(c.id, "2026-07-15").reasons[0]).toMatchObject({ closedBy: "season", recordId: c.id });
    expect(stateOn(c.id, "2026-12-15").state).toBe("open");
  });

  it("a 1.B stretch is closed on the trout opening day, 21 March 2026, and open the week after", () => {
    const b = walloon.find((r) => r.rule.type === "agw" && r.rule.category === "1.B")!;
    expect(stateOn(b.id, "2026-03-21").reasons[0]).toMatchObject({ closedBy: "fishing-day" });
    expect(stateOn(b.id, "2026-03-28").state).toBe("open");
  });

  it("a 1.A stretch is open on the first Saturday of June", () => {
    const a = walloon.find((r) => r.rule.type === "agw" && r.rule.category === "1.A")!;
    expect(stateOn(a.id, "2026-06-06").state).toBe("open");
  });

  it("Walloon water on no listed stretch is unknown and treated as not allowed, not forbidden", () => {
    // The Meuse at Namur is navigable but not in Annex 1 of the AGW.
    const status = accessAt({ lat: 50.4655, lng: 4.8665 }, builtInAccessRules, { date: "2026-12-15" });
    expect(status.state).toBe("unknown");
    expect(status.reasons[0]).toMatchObject({ recordId: "wallonia" });
    expect(status.reasons[0].kind === "rule" && status.reasons[0].ruleText).toMatch(/not allowed/);
  });
});
