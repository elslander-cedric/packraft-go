// Data checks for the shipped Walloon stretch dataset (#54, spec #51 seam 3, ADR 0024).
// Expected thresholds come from AGW Annex 2 as transcribed in docs/research/walloon-stretches.md,
// written out here by hand so the test doesn't reuse the data it checks.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import official from "@/access/data/official-stretches.json";
import { kmByOfficial, officialRuns, splitBoundaryEnds } from "@/dataprep/walloonStretches/official";
import spwLines from "../../docs/research/data/spw-stretch-lines.json";
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

/**
 * The official stretch of each record (#209), by hand from the SPW's lines and the research
 * (docs/research/kayak-spw-access-points.md section 4). Pieces are listed downstream.
 */
const OFFICIAL: Record<string, string | null> = {
  "1A1": "AMBLEVE3",
  "1A2": "LESSE6-7",
  "1A3a": "OURTHE1",
  "1A3b": "OURTHE2",
  "1A3c-1": "OURTHE3",
  "1A3c-2": null,
  "1A4-1": "SEMOIS2-3",
  "1A4-2": "SEMOIS4-5",
  "1B1a": "AMBLEVE1",
  "1B1b": null,
  "1B2a": "LESSE5",
  "1B2b-1": "LESSE5",
  "1B2b-2": "LESSE6-7",
  "1B2c": "LESSE6-7",
  "1B3": "VIROIN",
  "1B4a": "SEMOIS2-3",
  "1B4b": "SEMOIS2-3",
  "1B4c": "SEMOIS2-3",
  "1C1a": null,
  "1C1b": "SALM",
  "1C2a": "LESSE2",
  "1C2b-1": null,
  "1C2b-2": "LESSE4",
  "1C2c": null,
  "1C3": "HOUILLE",
  "1C4a": "SURE",
  "1C4b": "OUR",
  "1C5a": "AISNE",
  "1C5b": "OURTHEOCC",
  "1C5c": "OURTHEOR",
  "1C6a": "SEMOIS1",
  "1C6b": "VIERRE",
};

/** A record may only overlap another official line by less than this: more is a missed split. */
const MAX_ON_ANOTHER_LINE_KM = 2;
/** The issue's "short gaps of a few kilometres" stay with their record; a longer one is split off. */
const MAX_UNLISTED_KM = 10;
/** A record with no official stretch may only touch an SPW line at its ends. */
const MAX_ON_A_LINE_WHEN_UNLISTED_KM = 0.5;

const pending: string[] = (data.review as { pending?: string[] }).pending ?? [];
const review = JSON.parse(readFileSync(path.join(__dirname, "../../docs/research/data/walloon-stretches-review.json"), "utf8"));
const officialOf = (stretch: Stretch): string | undefined => (stretch as { officialStretch?: string }).officialStretch;
/** The Annex row a record comes from: its own id, or the id of the record it is a piece of. */
const annexIdOf = (stretch: Stretch): string => (stretch as { splitOf?: string }).splitOf ?? stretch.id;

/** Wallonia lies within this box; every stretch must too. */
const WALLONIA = { south: 49.45, west: 2.8, north: 50.85, east: 6.45 };

const metres = ([lng1, lat1]: number[], [lng2, lat2]: number[]) =>
  Math.hypot((lat1 - lat2) * 111_320, (lng1 - lng2) * 111_320 * Math.cos((lat1 * Math.PI) / 180));

describe("shipped Walloon stretch dataset", () => {
  it("has every one of the 28 Annex 1/2 stretches, whole or in pieces", () => {
    expect([...new Set(stretches.map(annexIdOf))].sort()).toEqual(Object.keys(ANNEX_2).sort());
  });

  it("has each record once", () => {
    expect(new Set(stretches.map((stretch) => stretch.id)).size).toBe(stretches.length);
  });

  it("gives every stretch a valid line along the river, from its start to its end", () => {
    for (const stretch of stretches) {
      expect(stretch.line.length, stretch.id).toBeGreaterThanOrEqual(2);
      for (const [lng, lat] of stretch.line) {
        expect(Number.isFinite(lat) && Number.isFinite(lng), stretch.id).toBe(true);
        expect(lat >= WALLONIA.south && lat <= WALLONIA.north && lng >= WALLONIA.west && lng <= WALLONIA.east, stretch.id).toBe(true);
      }
      const length = stretch.line.slice(1).reduce((sum, position, i) => sum + metres(stretch.line[i], position), 0);
      expect(length, stretch.id).toBeGreaterThan(200);
      expect(metres(stretch.line[0], [stretch.from.point.lng, stretch.from.point.lat]), stretch.id).toBeLessThan(5);
      expect(metres(stretch.line[stretch.line.length - 1], [stretch.to.point.lng, stretch.to.point.lat]), stretch.id).toBeLessThan(5);
    }
  });

  it("has thresholds and gauges matching Annex 2", () => {
    for (const stretch of stretches) {
      const [gauge, min, max] = ANNEX_2[annexIdOf(stretch)];
      expect({ min: stretch.minM3s, max: stretch.maxM3s }, stretch.id).toEqual({ min, max });
      expect(stretch.gauge?.name, stretch.id).toBe(SPW_PRACTICE[annexIdOf(stretch)]?.name ?? gauge);
    }
  });

  it("gives every stretch a KiWIS gauge", () => {
    for (const stretch of stretches) {expect(stretch.gauge?.stationNo, stretch.id).toMatch(/^L?\d+$/);}
  });

  it("uses Hérock for the Lesse from Han to Houyet, marked as SPW practice, and only there (#205)", () => {
    const practice = stretches.filter((stretch) => stretch.gauge?.spwPractice);
    expect([...new Set(practice.map(annexIdOf))]).toEqual(Object.keys(SPW_PRACTICE));
    expect(practice[0].gauge).toEqual({ name: "Hérock", stationNo: "L6610", assumed: false, spwPractice: true });
    expect(practice[0].note).toMatch(/Hérock/);
  });

  it("leaves the Salm and Our on their Annex 2 gauges until KiWIS shows the SPW's have the series (#205)", () => {
    const stationOf = (id: string) => stretches.find((stretch) => stretch.id === id)?.gauge?.stationNo;
    expect(stationOf("1C1b")).toBe("6832");
    expect(stationOf("1C4b")).toBe("9914");
  });

  it("flags exactly the Martelange, Membre, Martinrive and Gendron gauges as assumed (ADR 0024)", () => {
    const assumed = new Set(stretches.filter((stretch) => stretch.gauge?.assumed).map((assumed) => assumed.gauge!.name));
    expect([...assumed].sort()).toEqual(["Gendron", "Martelange", "Martinrive", "Membre"]);
  });

  it("leaves no end point needing review, but the split boundaries waiting for Cedric (#209)", () => {
    const needingReview = stretches.flatMap((stretch) =>
      (["from", "to"] as const).filter((end) => stretch[end].status === "needsReview" && !("sameAs" in stretch[end])).map((end) => `${stretch.id}.${end}`),
    );
    expect(needingReview.filter((end) => !splitBoundaryEnds().includes(end))).toEqual([]);
    expect(pending).toEqual(needingReview);
  });

  it("records source and research date on every record, and who reviewed it and when", () => {
    for (const stretch of stretches) {
      expect(stretch.source, stretch.id).toMatch(/Annex 1/);
      expect(stretch.source, stretch.id).toMatch(/OpenStreetMap/);
      expect(stretch.researchDate, stretch.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(data.researchDate).toBe("2026-10-12");
    expect(data.review).toMatchObject({
      reviewedBy: "Cedric",
      reviewedAt: review.reviewedAt,
      decisions: Object.keys(review.decisions).length,
    });
    expect(data.licence).toMatch(/ODbL/);
  });

  it("matches the committed review decisions", () => {
    for (const [id, decision] of Object.entries(review.decisions) as Array<[string, { lat: number; lng: number }]>) {
      const [stretchId, end] = id.split(".") as [string, "from" | "to"];
      // A decision taken on a whole record holds for the piece that kept that end.
      const pieces = stretches.filter((x) => annexIdOf(x) === stretchId);
      const found = stretches.find((x) => x.id === stretchId) ?? pieces.at(end === "from" ? 0 : -1)!;
      expect(found[end].status, id).toBe("reviewed");
      expect(metres([found[end].point.lng, found[end].point.lat], [decision.lng, decision.lat]), id).toBeLessThan(30);
    }
  });
});

describe("the mapping to official stretches (#209)", () => {
  const lines = Object.fromEntries(
    spwLines.stretches.map(({ id, parts }) => [id, parts.map((part) => part.map(([lng, lat]) => ({ lat: lat!, lng: lng! })))]),
  );
  const lengthOf = (line: number[][]) => line.slice(1).reduce((sum, position, i) => sum + metres(line[i]!, position), 0) / 1000;
  const totalsOf = (stretch: Stretch) => kmByOfficial(officialRuns(stretch.line.map(([lng, lat]) => ({ lat: lat!, lng: lng! })), lines));
  const piecesOf = (annexId: string) => stretches.filter((stretch) => annexIdOf(stretch) === annexId);

  it("gives each record the expected official stretch, or none", () => {
    expect(Object.fromEntries(stretches.map((stretch) => [stretch.id, officialOf(stretch) ?? null]))).toEqual(OFFICIAL);
  });

  it("gives every official stretch at least one record, and no record an unknown one", () => {
    const mapped = new Set(stretches.flatMap((stretch) => officialOf(stretch) ?? []));
    expect([...mapped].sort()).toEqual(official.stretches.map((stretch) => stretch.id).sort());
  });

  it("is checked against a line for every official stretch", () => {
    expect(spwLines.stretches.map((stretch) => stretch.id).sort()).toEqual(official.stretches.map((stretch) => stretch.id).sort());
  });

  it("puts the most of a mapped record on its official line, and at most a little on another", () => {
    for (const stretch of stretches) {
      const id = officialOf(stretch);
      if (!id) {continue;}
      const { none = 0, [id]: own = 0, ...others } = totalsOf(stretch);
      expect(own, stretch.id).toBeGreaterThan(Math.max(...Object.values(others), 0));
      for (const [other, km] of Object.entries(others)) {expect(km, `${stretch.id} on ${other}`).toBeLessThan(MAX_ON_ANOTHER_LINE_KM);}
      expect(none, stretch.id).toBeLessThan(MAX_UNLISTED_KM);
    }
  });

  it("keeps a record with no official stretch off the SPW's lines", () => {
    for (const unofficial of stretches.filter((x) => !officialOf(x))) {
      for (const [other, km] of Object.entries(totalsOf(unofficial))) {
        if (other !== "none") {expect(km, `${unofficial.id} on ${other}`).toBeLessThan(MAX_ON_A_LINE_WHEN_UNLISTED_KM);}
      }
    }
  });

  it("splits only where the SPW's lines call for it, into two pieces that meet exactly", () => {
    const split = [...new Set(stretches.filter((stretch) => stretch.id !== annexIdOf(stretch)).map(annexIdOf))];
    expect(split).toEqual(["1A3c", "1A4", "1B2b", "1C2b"]);
    for (const id of split) {
      const [upper, lower] = piecesOf(id);
      expect(piecesOf(id).map((piece) => piece.id)).toEqual([`${id}-1`, `${id}-2`]);
      expect(lower!.line[0]).toEqual(upper!.line.at(-1));
      expect(lower!.from.point).toEqual(upper!.to.point);
      expect(lower!.from).toMatchObject({ sameAs: `${id}-1.to` });
    }
  });

  it("keeps the whole river: a split record's pieces add up to the record", () => {
    const WHOLE_KM: Record<string, number> = { "1A3c": 55.1, "1A4": 81.6, "1B2b": 13.3, "1C2b": 27.1 };
    for (const [id, km] of Object.entries(WHOLE_KM)) {
      const [upper, lower] = piecesOf(id);
      expect(lengthOf(upper!.line) + lengthOf(lower!.line), id).toBeCloseTo(km, 0);
    }
  });

  it("keeps a split piece's category, thresholds, gauge and source", () => {
    const kept = ({ category, minM3s, maxM3s, gauge, source, researchDate, river, note }: Stretch) => ({
      category,
      minM3s,
      maxM3s,
      gauge,
      source,
      researchDate,
      river,
      note,
    });
    for (const id of ["1A3c", "1A4", "1B2b", "1C2b"]) {
      const [upper, lower] = piecesOf(id);
      expect(kept(lower!), id).toEqual(kept(upper!));
    }
  });

  it("puts the part of 1A4 above Linglé on the SEMOIS2-3 line, with 1B4c", () => {
    const [deleauToLingle] = piecesOf("1A4");
    expect(deleauToLingle!.to.en).toBe("Linglé bridge");
    expect(deleauToLingle!.lengthKm).toBeCloseTo(3.2, 0);
    expect(totalsOf(deleauToLingle!)["SEMOIS2-3"]).toBeGreaterThan(2.8);
  });

  it("says in the review metadata which split boundaries still wait for review", () => {
    const decided = Object.keys(review.decisions);
    expect(pending).toEqual(splitBoundaryEnds().filter((end) => !decided.includes(end)));
  });
});
