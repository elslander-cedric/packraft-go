// Acceptance tests for #59 (Walloon access), written from the ticket and the AGW research.
// Dates and weekdays are computed by hand, not by the code under test.
import { describe, expect, it } from "vitest";
import { accessAt, accessAlong, type AccessRecord } from "@/core/access";
import { agwDay, fishingOpeningDays, inSeason1C } from "@/core/agw";
import { builtInAccessRules } from "./builtInRules";

const agw = (category: string) =>
  builtInAccessRules.records.find((r) => r.rule.type === "agw" && r.rule.category === category)!;
const mid = (r: AccessRecord) => {
  const c = (r.geometry as unknown as { coordinates: number[][] }).coordinates;
  const [lng, lat] = c[Math.floor(c.length / 2)]!;
  return { lat: lat!, lng: lng! };
};

describe("#59 seasons", () => {
  it("1.C is open 1 Oct to 15 Mar only", () => {
    expect(inSeason1C("2026-09-30")).toBe(false);
    expect(inSeason1C("2026-10-01")).toBe(true);
    expect(inSeason1C("2027-03-15")).toBe(true);
    expect(inSeason1C("2027-03-16")).toBe(false);
    expect(agwDay("1.C", "2026-07-15").closure).toBe("season");
    expect(agwDay("1.A", "2026-07-15").closure).toBeUndefined();
    expect(agwDay("1.B", "2026-07-15").closure).toBeUndefined();
  });
});

describe("#59 fishing opening days (3rd Sat of March, 1st Sat of June)", () => {
  // 1 Mar 2026 is a Sunday -> Saturdays 7, 14, 21. 1 Jun 2026 is a Monday -> first Saturday 6.
  // 1 Mar 2027 is a Monday -> Saturdays 6, 13, 20. 1 Jun 2027 is a Tuesday -> first Saturday 5.
  it("2026 and 2027", () => {
    expect(fishingOpeningDays(2026)).toEqual({ trout: "2026-03-21", general: "2026-06-06" });
    expect(fishingOpeningDays(2027)).toEqual({ trout: "2027-03-20", general: "2027-06-05" });
  });
  it("close 1.B and 1.C, not 1.A", () => {
    expect(agwDay("1.B", "2026-06-06").closure).toBe("fishing-day");
    expect(agwDay("1.B", "2026-03-21").closure).toBe("fishing-day");
    expect(agwDay("1.B", "2026-06-13").closure).toBeUndefined();
    expect(agwDay("1.A", "2026-06-06").closure).toBeUndefined();
    expect(agwDay("1.C", "2027-03-20").closure).toBe("season");
    // 1 Mar 2025 is a Saturday: Saturdays 1, 8, 15. So 15 Mar 2025 is the trout day, inside the 1.C season.
    expect(agwDay("1.C", "2025-03-15").closure).toBe("fishing-day");
  });
});

describe("#59 opening hours at period boundaries", () => {
  const h = (c: "1.A" | "1.B" | "1.C", d: string) => `${agwDay(c, d).hours.from}-${agwDay(c, d).hours.to}`;
  it("1.A", () => {
    expect(h("1.A", "2026-03-15")).toBe("09:30-17:00");
    expect(h("1.A", "2026-03-16")).toBe("09:30-19:00");
    expect(h("1.A", "2026-06-15")).toBe("09:30-19:00");
    expect(h("1.A", "2026-06-16")).toBe("09:30-20:00");
    expect(h("1.A", "2026-10-15")).toBe("09:30-20:00");
    expect(h("1.A", "2026-10-16")).toBe("09:30-17:00");
  });
  it("1.B and 1.C", () => {
    for (const c of ["1.B", "1.C"] as const) {
      expect(h(c, "2026-06-15")).toBe("10:00-17:00");
      expect(h(c, "2026-06-16")).toBe("09:30-18:00");
      expect(h(c, "2026-09-30")).toBe("09:30-18:00");
      expect(h(c, "2026-10-01")).toBe("10:00-17:00");
    }
  });
});

describe("#59 through the access evaluation (built-in data)", () => {
  const today = "2026-10-14";
  it("a 1.C stretch: closed today (season) in July, open in January, unknown without a date", () => {
    const p = mid(agw("1.C"));
    const july = accessAt(p, builtInAccessRules, { date: "2026-07-15", today });
    expect(july.state).toBe("closed-today");
    expect(JSON.stringify(july.reasons)).toMatch(/season/i);
    expect(accessAt(p, builtInAccessRules, { date: "2027-01-15", today }).state).toBe("open");
    expect(accessAt(p, builtInAccessRules, { today }).state).toBe("unknown");
  });
  it("a 1.B stretch is closed on the 2026 June opening day only", () => {
    const p = mid(agw("1.B"));
    expect(accessAt(p, builtInAccessRules, { date: "2026-06-06", today }).state).toBe("closed-today");
    expect(accessAt(p, builtInAccessRules, { date: "2026-06-07", today }).state).toBe("open");
  });
  it("unlisted Walloon water (Meuse at Dinant) is forbidden, with a reason, on any date", () => {
    for (const date of [undefined, "2026-07-15", "2027-01-15"]) {
      const s = accessAlong([{ lat: 50.26, lng: 4.91 }, { lat: 50.265, lng: 4.915 }], builtInAccessRules, { date, today });
      expect(s.state).toBe("forbidden");
      expect(JSON.stringify(s.reasons)).toMatch(/AGW/);
    }
  });
  it("assumed gauges are kept and flagged", () => {
    const assumed = builtInAccessRules.records.filter((r) => r.rule.type === "agw" && r.rule.gauge?.assumed);
    expect(new Set(assumed.map((r) => (r.rule.type === "agw" ? r.rule.gauge!.name : "")))).toEqual(
      new Set(["Martinrive", "Gendron", "Martelange", "Membre"]),
    );
    for (const r of assumed) expect(r.unverified).toMatch(/assumed/i);
  });
});
