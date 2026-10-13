// Acceptance tests for #55 (ADR 0023), written by the tester: merge-import
// de-duplication, invalid-file refusal, borders, special characters.
import { describe, expect, it } from "vitest";
import {
  mergeAccessPoints,
  parseAccessPoints,
  restoreStoredAccessPoints,
  serialiseAccessPoints,
  type AccessPoint,
} from "./accessPoints";

const T = "2026-10-12T08:00:00.000Z";
const pt = (id: string, lat: number, lng: number, extra: Partial<AccessPoint> = {}): AccessPoint => ({
  id,
  position: { lat, lng },
  use: "both",
  kind: "informal-bank",
  note: "",
  checkedOnSite: null,
  createdAt: T,
  updatedAt: T,
  ...extra,
});
// 1 m of latitude in degrees
const M = 1 / 111_195;
let n = 0;
const newId = () => `new-${++n}`;

describe("merge", () => {
  it("skips identical fields within 5 m, even with other id and timestamps", () => {
    const yours = [pt("a", 50.5, 5.5)];
    const r = mergeAccessPoints(yours, [pt("z", 50.5 + 3 * M, 5.5, { createdAt: "2020-01-01T00:00:00Z" })], newId);
    expect(r.added).toBe(0);
    expect(r.alreadyThere).toBe(1);
    expect(r.accessPoints).toEqual(yours);
  });
  it("keeps a point farther than 5 m", () => {
    const r = mergeAccessPoints([pt("a", 50.5, 5.5)], [pt("b", 50.5 + 6 * M, 5.5)], newId);
    expect(r.added).toBe(1);
  });
  it.each([
    ["use", { use: "put-in" as const }],
    ["kind", { kind: "slipway" as const }],
    ["note", { note: "other" }],
    ["checked", { checkedOnSite: "2026-10-01" }],
  ])("keeps a near duplicate with a different %s", (_n, change) => {
    const r = mergeAccessPoints([pt("a", 50.5, 5.5)], [pt("b", 50.5, 5.5, change)], newId);
    expect(r.added).toBe(1);
    expect(r.accessPoints).toHaveLength(2);
  });
  it("collapses exact duplicates within the imported file against each other", () => {
    const r = mergeAccessPoints([], [pt("a", 50.5, 5.5), pt("b", 50.5, 5.5)], newId);
    expect(r.accessPoints).toHaveLength(1);
    expect(r.added).toBe(1);
    expect(r.alreadyThere).toBe(1);
  });
  it("gives a new id when the imported id is taken by a different point", () => {
    const r = mergeAccessPoints([pt("a", 50.5, 5.5)], [pt("a", 51, 4)], newId);
    expect(new Set(r.accessPoints.map((p) => p.id)).size).toBe(2);
  });
  it("does not change your points", () => {
    const yours = [pt("a", 50.5, 5.5, { note: "mine" })];
    const copy = structuredClone(yours);
    mergeAccessPoints(yours, [pt("a", 50.5, 5.5, { note: "theirs" })], newId);
    expect(yours).toEqual(copy);
  });
});

describe("format", () => {
  const border = [
    pt("w", 49.5, 5.7), // south Belgium (approx)
    pt("e", 50.4, 6.4), // east (Sankt Vith area)
    pt("n", 51.5, 4.9), // north
    pt("s", 51.09, 2.55), // coast, De Panne
    pt("edge", 90, 180),
    pt("edge2", -90, -180),
  ];
  it("round-trips border positions exactly", () => {
    const r = parseAccessPoints(serialiseAccessPoints(border));
    expect(r).toEqual({ ok: true, accessPoints: border });
  });
  it("round-trips special characters in notes", () => {
    const notes = ['a/b:c&d<e>"f\'', "line1\nline2\ttab", "emoji 🛶 é ü ß 日本", "\u0000ctrl\u001f", "</script><!--", "\\u0041 \\", " ", "x".repeat(10000)];
    const pts = notes.map((note, i) => pt(`id/${i}&<`, 50.5, 5.5 + i / 1000, { note }));
    const r = parseAccessPoints(serialiseAccessPoints(pts));
    expect(r).toEqual({ ok: true, accessPoints: pts });
  });
  it.each([
    ["not json", "{nope"],
    ["empty", ""],
    ["array", "[]"],
    ["null", "null"],
    ["trip file", JSON.stringify({ format: "packraft-go-trip", version: 1, trip: {} })],
    ["lat out of range", serialiseAccessPoints([pt("a", 91, 5)])],
    ["lng out of range", serialiseAccessPoints([pt("a", 50, 181)])],
    ["NaN as null", serialiseAccessPoints([pt("a", NaN, 5)])],
    ["duplicate ids", serialiseAccessPoints([pt("a", 50, 5), pt("a", 51, 5)])],
    ["bad use", serialiseAccessPoints([pt("a", 50, 5, { use: "x" as never })])],
    ["bad date", serialiseAccessPoints([pt("a", 50, 5, { checkedOnSite: "2026-02-30" })])],
    ["note not string", JSON.stringify({ format: "packraft-go-access-points", version: 1, accessPoints: [{ ...pt("a", 50, 5), note: 5 }] })],
    ["one bad among good", serialiseAccessPoints([pt("a", 50, 5), pt("b", 500, 5)])],
    ["missing list", JSON.stringify({ format: "packraft-go-access-points", version: 1 })],
  ])("refuses %s without a reason", (_n, text) => {
    expect(parseAccessPoints(text)).toEqual({ ok: false });
  });
  it.each([0, 2, 99, 1.5])("refuses version %s as unknown-version", (v) => {
    const text = JSON.stringify({ format: "packraft-go-access-points", version: v, accessPoints: [] });
    expect(parseAccessPoints(text)).toEqual({ ok: false, reason: "unknown-version" });
  });
  it("restore: damaged -> empty, not flagged; unknown version -> flagged; null -> empty", () => {
    expect(restoreStoredAccessPoints("{bad")).toEqual({ accessPoints: [], unknownVersion: false });
    expect(restoreStoredAccessPoints(null)).toEqual({ accessPoints: [], unknownVersion: false });
    expect(
      restoreStoredAccessPoints(JSON.stringify({ format: "packraft-go-access-points", version: 7, accessPoints: [] })),
    ).toEqual({ accessPoints: [], unknownVersion: true });
  });
});
