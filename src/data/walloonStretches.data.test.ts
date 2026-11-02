// Data checks for the shipped Walloon stretch dataset (#54, spec #51 seam 3, ADR 0024).
// Expected thresholds come from AGW Annex 2 as transcribed in docs/research/walloon-stretches.md,
// written out here by hand so the test doesn't reuse the data it checks.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import data from "./walloon-stretches.json";

type Stretch = (typeof data.stretches)[number];
const stretches: Stretch[] = data.stretches;

/** Annex 2: gauge, minimum and maximum flow (m³/s) per stretch. */
const ANNEX_2: Record<string, [string, number | null, number]> = {
  "1A1": ["Martinrive", 2.5, 44],
  "1A2": ["Gendron", 1.5, 52],
  "1A3a": ["Nisramont", 3.0, 31],
  "1A3b": ["Durbuy", 1.9, 50],
  "1A3c": ["Tabreux", 2.5, 65],
  "1A4": ["Membre", 2.2, 50],
  "1B1a": ["Stavelot", 1.0, 21],
  "1B1b": ["Martinrive", 2.5, 44],
  "1B2a": ["Gendron", 2.0, 52],
  "1B2b": ["Gendron", 1.5, 52],
  "1B2c": ["Gendron", 1.5, 52],
  "1B3": ["Treignes", 1.6, 23],
  "1B4a": ["Chiny", 1.5, 31],
  "1B4b": ["Chiny", 1.5, 31],
  "1B4c": ["Membre", 2.2, 50],
  "1C1a": ["Malmedy", null, 8.9],
  "1C1b": ["Trois-Ponts", null, 9.7],
  "1C2a": ["Daverdisse", null, 14],
  "1C2b": ["Wanlin", null, 47],
  "1C2c": ["Jemelle", null, 11],
  "1C3": ["Gedinne", null, 3.8],
  "1C4a": ["Martelange", null, 9.9],
  "1C4b": ["Reuland", null, 17],
  "1C5a": ["Erezée", null, 4.4],
  "1C5b": ["Amberloup", null, 6],
  "1C5c": ["Houffalize", null, 8.8],
  "1C6a": ["Tintigny", null, 17],
  "1C6b": ["Martilly", null, 8.6],
};

/** Where the app follows the SPW's gauge, not Annex 2's: KiWIS has no such Annex 2 station (#205). */
const SPW_PRACTICE: Record<string, { name: string }> = { "1C2b": { name: "Hérock" } };

/** Wallonia lies within this box; every stretch must too. */
const WALLONIA = { south: 49.45, west: 2.8, north: 50.85, east: 6.45 };

const metres = ([lng1, lat1]: number[], [lng2, lat2]: number[]) =>
  Math.hypot((lat1 - lat2) * 111_320, (lng1 - lng2) * 111_320 * Math.cos((lat1 * Math.PI) / 180));

describe("shipped Walloon stretch dataset", () => {
  it("has the 28 Annex 1/2 stretches, once each", () => {
    expect(stretches.map((s) => s.id).sort()).toEqual(Object.keys(ANNEX_2).sort());
  });

  it("gives every stretch a valid line along the river, from its start to its end", () => {
    for (const s of stretches) {
      expect(s.line.length, s.id).toBeGreaterThanOrEqual(2);
      for (const [lng, lat] of s.line) {
        expect(Number.isFinite(lat) && Number.isFinite(lng), s.id).toBe(true);
        expect(lat >= WALLONIA.south && lat <= WALLONIA.north && lng >= WALLONIA.west && lng <= WALLONIA.east, s.id).toBe(true);
      }
      const length = s.line.slice(1).reduce((sum, p, i) => sum + metres(s.line[i], p), 0);
      expect(length, s.id).toBeGreaterThan(200);
      expect(metres(s.line[0], [s.from.point.lng, s.from.point.lat]), s.id).toBeLessThan(5);
      expect(metres(s.line[s.line.length - 1], [s.to.point.lng, s.to.point.lat]), s.id).toBeLessThan(5);
    }
  });

  it("has thresholds and gauges matching Annex 2", () => {
    for (const s of stretches) {
      const [gauge, min, max] = ANNEX_2[s.id];
      expect({ min: s.minM3s, max: s.maxM3s }, s.id).toEqual({ min, max });
      expect(s.gauge?.name, s.id).toBe(SPW_PRACTICE[s.id]?.name ?? gauge);
    }
  });

  it("gives every stretch a KiWIS gauge", () => {
    for (const s of stretches) expect(s.gauge?.stationNo, s.id).toMatch(/^L?\d+$/);
  });

  it("uses Hérock for the Lesse from Han to Houyet, marked as SPW practice, and only there (#205)", () => {
    const practice = stretches.filter((s) => s.gauge?.spwPractice);
    expect(practice.map((s) => s.id)).toEqual(Object.keys(SPW_PRACTICE));
    expect(practice[0].gauge).toEqual({ name: "Hérock", stationNo: "L6610", assumed: false, spwPractice: true });
    expect(practice[0].note).toMatch(/Hérock/);
  });

  it("leaves the Salm and Our on their Annex 2 gauges until KiWIS shows the SPW's have the series (#205)", () => {
    const stationOf = (id: string) => stretches.find((s) => s.id === id)?.gauge?.stationNo;
    expect(stationOf("1C1b")).toBe("6832");
    expect(stationOf("1C4b")).toBe("9914");
  });

  it("flags exactly the Martelange, Membre, Martinrive and Gendron gauges as assumed (ADR 0024)", () => {
    const assumed = new Set(stretches.filter((s) => s.gauge?.assumed).map((s) => s.gauge!.name));
    expect([...assumed].sort()).toEqual(["Gendron", "Martelange", "Martinrive", "Membre"]);
  });

  it("leaves no end point needing review", () => {
    const ends = stretches.flatMap((s) => [s.from, s.to]);
    expect(ends.filter((e) => e.status === "needsReview")).toEqual([]);
    for (const e of ends) expect(["confident", "reviewed"]).toContain(e.status);
  });

  it("records source and research date on every record, and who reviewed it and when", () => {
    for (const s of stretches) {
      expect(s.source, s.id).toMatch(/Annex 1/);
      expect(s.source, s.id).toMatch(/OpenStreetMap/);
      expect(s.researchDate, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(data.researchDate).toBe("2026-10-12");
    expect(data.review).toEqual({ reviewedBy: "Cedric", reviewedAt: "2026-10-13", decisions: 35 });
    expect(data.licence).toMatch(/ODbL/);
  });

  it("matches the committed review decisions", () => {
    const review = JSON.parse(
      readFileSync(path.join(__dirname, "../../docs/research/data/walloon-stretches-review.json"), "utf8"),
    );
    for (const [id, decision] of Object.entries(review.decisions) as Array<[string, { lat: number; lng: number }]>) {
      const [stretchId, end] = id.split(".") as [string, "from" | "to"];
      const s = stretches.find((x) => x.id === stretchId)!;
      expect(s[end].status, id).toBe("reviewed");
      expect(metres([s[end].point.lng, s[end].point.lat], [decision.lng, decision.lat]), id).toBeLessThan(30);
    }
  });
});
