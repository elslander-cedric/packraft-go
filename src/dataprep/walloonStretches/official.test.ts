// #209: each record knows its official stretch, and one that spans two parts of the
// SPW's network is cut at the boundary. Worked examples on a straight river along a
// parallel: 0.001° of longitude is about 72 m at this latitude.
import { describe, expect, it } from "vitest";
import type { DraftStretch, StretchEnd } from "./build";
import { officialRuns, rejoinSplits, splitAtOfficialBoundaries, type OfficialMapping } from "./official";
import type { ShippedStretch } from "./dataset";

const LAT = 50;
const end = (name: string, lng: number, over: Partial<StretchEnd> = {}): StretchEnd => ({
  fr: name,
  en: name,
  point: { lat: LAT, lng },
  status: "reviewed",
  reason: "Confirmed by review.",
  ...over,
});

const draft = (id: string, over: Partial<DraftStretch> = {}): DraftStretch => ({
  id,
  annex1Ref: id,
  category: "1.A",
  subBasin: "Test",
  river: "Test",
  from: end("start", 5),
  to: end("end", 5.1),
  annex2Gauge: "Membre",
  minM3s: 2.2,
  maxM3s: 50,
  note: "A note.",
  line: [
    [5, LAT],
    [5.04, LAT],
    [5.1, LAT],
  ],
  lengthKm: 7.2,
  ...over,
});

const mapping: OfficialMapping = {
  whole: { "1X2": "WHOLE" },
  splits: [
    {
      id: "1X1",
      at: { lat: LAT, lng: 5.06 },
      boundary: { fr: "pont de la limite", en: "boundary bridge" },
      pieces: ["UPPER", "LOWER"],
      why: "The SPW's UPPER line ends here.",
    },
    {
      id: "1X3",
      at: { lat: LAT, lng: 5.03 },
      boundary: { fr: "ici", en: "here" },
      pieces: ["ONLY", null],
      why: "The SPW's line stops here.",
    },
  ],
};

const split = (stretches: DraftStretch[], review = {}) => splitAtOfficialBoundaries(stretches, review, mapping);

describe("splitting a record at an official boundary", () => {
  const [upper, lower] = split([draft("1X1")]);

  it("makes two records that meet at the boundary, on one shared vertex", () => {
    expect(upper!.line.at(-1)).toEqual([5.06, LAT]);
    expect(lower!.line[0]).toEqual([5.06, LAT]);
    expect(upper!.line).toEqual([
      [5, LAT],
      [5.04, LAT],
      [5.06, LAT],
    ]);
    expect(lower!.line).toEqual([
      [5.06, LAT],
      [5.1, LAT],
    ]);
  });

  it("gives each piece its official stretch", () => {
    expect([upper!.officialStretch, lower!.officialStretch]).toEqual(["UPPER", "LOWER"]);
  });

  it("names the pieces after the record, and keeps the Annex row they came from", () => {
    expect([upper!.id, lower!.id]).toEqual(["1X1-1", "1X1-2"]);
    expect([upper!.splitOf, lower!.splitOf]).toEqual(["1X1", "1X1"]);
  });

  it("keeps the record's category, thresholds, gauge and note on both pieces", () => {
    for (const piece of [upper!, lower!]) {
      expect(piece).toMatchObject({ category: "1.A", minM3s: 2.2, maxM3s: 50, annex2Gauge: "Membre", note: "A note." });
    }
  });

  it("keeps the record's outer ends, and names the boundary between them", () => {
    expect(upper!.from.en).toBe("start");
    expect(upper!.to.en).toBe("boundary bridge");
    expect(lower!.from.fr).toBe("pont de la limite");
    expect(lower!.to.en).toBe("end");
  });

  it("shares out the length", () => {
    expect(upper!.lengthKm).toBeCloseTo(4.3, 1);
    expect(lower!.lengthKm).toBeCloseTo(2.9, 1);
  });

  it("leaves the boundary for review, once: the second piece's start points at the first's end", () => {
    expect(upper!.to.status).toBe("needsReview");
    expect(upper!.to.reason).toMatch(/UPPER line ends here/);
    expect(lower!.from).toMatchObject({ status: "needsReview", sameAs: "1X1-1.to" });
  });

  it("can leave the second piece without an official stretch", () => {
    const [listed, unlisted] = split([draft("1X3")]);
    expect(listed!.officialStretch).toBe("ONLY");
    expect(unlisted).not.toHaveProperty("officialStretch");
  });
});

describe("the other records", () => {
  it("get their official stretch and stay whole", () => {
    const [whole] = split([draft("1X2")]);
    expect(whole).toMatchObject({ id: "1X2", officialStretch: "WHOLE" });
  });

  it("have none where the SPW lists none", () => {
    expect(split([draft("1X9")])[0]).not.toHaveProperty("officialStretch");
  });

  it("follow a split neighbour: an end shared with a record now in pieces points at the right piece", () => {
    const before = draft("1X8", { to: end("end", 5, { sameAs: "1X1.from" }) });
    const after = draft("1X7", { from: end("start", 5.1, { sameAs: "1X1.to" }) });
    const stretches = split([before, draft("1X1"), after]);
    expect(stretches.find((s) => s.id === "1X8")!.to.sameAs).toBe("1X1-1.from");
    expect(stretches.find((s) => s.id === "1X7")!.from.sameAs).toBe("1X1-2.to");
  });
});

describe("reviewing a boundary", () => {
  it("is reviewed once confirmed", () => {
    const [upper, lower] = split([draft("1X1")], { "1X1-1.to": { action: "confirm", lat: LAT, lng: 5.06 } });
    expect(upper!.to.status).toBe("reviewed");
    expect(lower!.from.status).toBe("reviewed");
  });

  it("moves along the river, snapped to it, when moved", () => {
    const [upper, lower] = split([draft("1X1")], { "1X1-1.to": { action: "move", lat: LAT + 0.0001, lng: 5.08, note: "The bridge" } });
    expect(upper!.line.at(-1)).toEqual([5.08, LAT]);
    expect(lower!.line[0]).toEqual([5.08, LAT]);
    expect(upper!.to).toMatchObject({ status: "reviewed", point: { lat: LAT, lng: 5.08 } });
    expect(upper!.to.reason).toMatch(/The bridge/);
  });
});

describe("re-cutting the shipped lines, with no OSM data", () => {
  it("keeps apart records that share an Annex reference", () => {
    const records = [draft("1A3a", { annex1Ref: "1A3" }), draft("1A3b", { annex1Ref: "1A3" })];
    expect(rejoinSplits(records, []).map((s) => s.id)).toEqual(["1A3a", "1A3b"]);
  });

  const annex = [{ id: "1X1", annex2Gauge: "Membre" }, { id: "1X2", annex2Gauge: "Gendron" }];
  const shipped = (stretch: DraftStretch): ShippedStretch => ({ ...stretch, gauge: null, source: "s", researchDate: "2026-10-12" });

  it("gets the record back as it was before the split", () => {
    const pieces = split([draft("1X1"), draft("1X2")]).map(shipped);
    const [record, other] = rejoinSplits(pieces, annex);
    expect(record).toMatchObject({ id: "1X1", annex2Gauge: "Membre", lengthKm: 7.2 });
    expect(record!.from.en).toBe("start");
    expect(record!.to.en).toBe("end");
    expect(record).not.toHaveProperty("officialStretch");
    expect(record).not.toHaveProperty("splitOf");
    expect(record!.line).toEqual([
      [5, LAT],
      [5.04, LAT],
      [5.06, LAT],
      [5.1, LAT],
    ]);
    expect(other).toMatchObject({ id: "1X2", annex2Gauge: "Gendron" });
  });

  it("gives the same pieces when cut again", () => {
    const pieces = split([draft("1X1"), draft("1X2")]);
    const again = split(rejoinSplits(pieces.map(shipped), annex));
    expect(again.map((s) => s.line)).toEqual(pieces.map((s) => s.line));
    expect(again.map((s) => s.to)).toEqual(pieces.map((s) => s.to));
    expect(again.map((s) => s.from)).toEqual(pieces.map((s) => s.from));
  });
});

describe("where a line runs along the SPW's lines", () => {
  const near = (lat: number) => [
    [
      { lat, lng: 5 },
      { lat, lng: 5.04 },
    ],
  ];
  const lines = {
    FIRST: near(LAT),
    SECOND: [
      [
        { lat: LAT, lng: 5.04 },
        { lat: LAT, lng: 5.08 },
      ],
    ],
  };
  const line = [
    { lat: LAT, lng: 5 },
    { lat: LAT, lng: 5.1 },
  ];

  it("gives the runs in order along it, with their lengths, and the part on no line", () => {
    const runs = officialRuns(line, lines);
    expect(runs.map((r) => r.official)).toEqual(["FIRST", "SECOND", null]);
    expect(runs[0]!.fromKm).toBe(0);
    expect(runs[1]!.fromKm).toBeCloseTo(2.9, 1);
    expect(runs[2]!.toKm).toBeCloseTo(7.2, 1);
  });

  it("calls a line further than 100 m away no line at all", () => {
    expect(officialRuns(line, { FAR: near(LAT + 0.002) }).map((r) => r.official)).toEqual([null]);
  });
});
