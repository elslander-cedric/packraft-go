// Access points (#55, ADR 0023, GLOSSARY "Access point"): the planner's own
// collection, separate from trips. Edits, the versioned format, and merge-import.
import { describe, expect, it } from "vitest";
import {
  addAccessPoint,
  deleteAccessPoint,
  mergeAccessPoints,
  parseAccessPoints,
  restoreStoredAccessPoints,
  serialiseAccessPoints,
  updateAccessPoint,
  type AccessPoint,
} from "./accessPoints";

const T1 = "2026-10-13T08:00:00.000Z";
const T2 = "2026-10-14T09:30:00.000Z";

const durbuy = { lat: 50.3527, lng: 5.4563 };
const barvaux = { lat: 50.3497, lng: 5.4953 };

describe("access point collection edits", () => {
  it("adding a point at a position gives it defaults, an id and its timestamps", () => {
    const added = addAccessPoint([], { id: "a", at: durbuy, now: T1 });
    expect(added).toEqual<AccessPoint[]>([
      {
        id: "a",
        position: durbuy,
        use: "both",
        kind: "informal-bank",
        note: "",
        checkedOnSite: null,
        createdAt: T1,
        updatedAt: T1,
      },
    ]);
  });

  it("editing a point changes its fields and its updated time, not its id or created time", () => {
    const points = addAccessPoint(addAccessPoint([], { id: "a", at: durbuy, now: T1 }), { id: "b", at: barvaux, now: T1 });
    const edited = updateAccessPoint(points, "b", { use: "take-out", kind: "official-aire", note: "Steps by the bridge", checkedOnSite: "2026-10-14" }, T2);
    expect(edited[0]).toBe(points[0]);
    expect(edited[1]).toEqual({
      ...points[1],
      use: "take-out",
      kind: "official-aire",
      note: "Steps by the bridge",
      checkedOnSite: "2026-10-14",
      updatedAt: T2,
    });
  });

  it("moving a point changes its position", () => {
    const points = addAccessPoint([], { id: "a", at: durbuy, now: T1 });
    expect(updateAccessPoint(points, "a", { position: barvaux }, T2)[0]).toMatchObject({ position: barvaux, updatedAt: T2 });
  });

  it("a point can be marked as not checked on site again", () => {
    const checked = updateAccessPoint(addAccessPoint([], { id: "a", at: durbuy, now: T1 }), "a", { checkedOnSite: "2026-10-13" }, T1);
    expect(updateAccessPoint(checked, "a", { checkedOnSite: null }, T2)[0].checkedOnSite).toBeNull();
  });

  it("an edit with an impossible checked date, or for an unknown point, changes nothing", () => {
    const points = addAccessPoint([], { id: "a", at: durbuy, now: T1 });
    expect(updateAccessPoint(points, "a", { checkedOnSite: "2026-02-30" }, T2)).toBe(points);
    expect(updateAccessPoint(points, "zzz", { note: "x" }, T2)).toBe(points);
  });

  it("deleting a point removes only that point", () => {
    const points = addAccessPoint(addAccessPoint([], { id: "a", at: durbuy, now: T1 }), { id: "b", at: barvaux, now: T1 });
    expect(deleteAccessPoint(points, "a")).toEqual([points[1]]);
    expect(deleteAccessPoint(points, "zzz")).toBe(points);
  });
});

const marked: AccessPoint = {
  id: "a",
  position: durbuy,
  use: "put-in",
  kind: "slipway",
  note: "Park at the church",
  checkedOnSite: "2026-10-13",
  createdAt: T1,
  updatedAt: T2,
};
const unchecked: AccessPoint = { ...marked, id: "b", position: barvaux, use: "both", kind: "jetty", note: "", checkedOnSite: null };

const file = (points: unknown, version: unknown = 1) =>
  JSON.stringify({ format: "packraft-go-access-points", version, accessPoints: points });

describe("access points format", () => {
  it("is versioned, starting at version 1, under its own format name", () => {
    expect(JSON.parse(serialiseAccessPoints([marked]))).toEqual({
      format: "packraft-go-access-points",
      version: 1,
      accessPoints: [marked],
    });
  });

  it("round-trips every field", () => {
    expect(parseAccessPoints(serialiseAccessPoints([marked, unchecked]))).toEqual({
      ok: true,
      accessPoints: [marked, unchecked],
    });
  });

  it("ignores fields it does not know", () => {
    const parsed = parseAccessPoints(file([{ ...marked, colour: "red" }]));
    expect(parsed).toEqual({ ok: true, accessPoints: [marked] });
  });

  it.each([
    ["not JSON", "{oops"],
    ["a trip file", JSON.stringify({ format: "packraft-go-trip", version: 1, trip: {} })],
    ["no list", file(undefined)],
    ["a position out of range", file([{ ...marked, position: { lat: 95, lng: 5 } }])],
    ["an unknown use", file([{ ...marked, use: "launch" }])],
    ["an unknown kind", file([{ ...marked, kind: "beach" }])],
    ["a note that is not text", file([{ ...marked, note: 3 }])],
    ["an impossible checked date", file([{ ...marked, checkedOnSite: "2026-13-01" }])],
    ["a missing id", file([{ ...marked, id: "" }])],
    ["a repeated id", file([marked, { ...unchecked, id: "a" }])],
    ["a timestamp that is not a time", file([{ ...marked, createdAt: "yesterday" }])],
  ])("refuses an invalid file (%s)", (_, text) => {
    expect(parseAccessPoints(text)).toEqual({ ok: false });
  });

  it("refuses another version as an unknown version", () => {
    expect(parseAccessPoints(file([marked], 2))).toEqual({ ok: false, reason: "unknown-version" });
  });
});

describe("access points autosave", () => {
  it("nothing stored gives no access points", () => {
    expect(restoreStoredAccessPoints(null)).toEqual({ accessPoints: [], unknownVersion: false });
  });

  it("restores what was stored", () => {
    expect(restoreStoredAccessPoints(serialiseAccessPoints([marked]))).toEqual({
      accessPoints: [marked],
      unknownVersion: false,
    });
  });

  it("flags a save from an unknown version, so it is kept rather than overwritten", () => {
    expect(restoreStoredAccessPoints(file([marked], 2))).toEqual({ accessPoints: [], unknownVersion: true });
  });
});

describe("importing access points", () => {
  let next = 0;
  const newId = () => `new-${++next}`;

  // About 3 m north of Durbuy (1e-5 degrees of latitude is about 1.1 m).
  const nearDurbuy = { lat: durbuy.lat + 0.000027, lng: durbuy.lng };
  // About 20 m north of Durbuy.
  const offDurbuy = { lat: durbuy.lat + 0.00018, lng: durbuy.lng };

  it("adds the imported points after your own", () => {
    expect(mergeAccessPoints([marked], [unchecked], newId)).toEqual({
      accessPoints: [marked, unchecked],
      added: 1,
      alreadyThere: 0,
    });
  });

  it("skips a point identical to one you have, even a few metres away and with other timestamps", () => {
    const friendsCopy = { ...marked, id: "friend-1", position: nearDurbuy, createdAt: T2, updatedAt: T2 };
    expect(mergeAccessPoints([marked], [friendsCopy], newId)).toEqual({
      accessPoints: [marked],
      added: 0,
      alreadyThere: 1,
    });
  });

  it("re-importing your own export changes nothing", () => {
    const parsed = parseAccessPoints(serialiseAccessPoints([marked, unchecked]));
    if (!parsed.ok) throw new Error("export should parse");
    expect(mergeAccessPoints([marked, unchecked], parsed.accessPoints, newId)).toEqual({
      accessPoints: [marked, unchecked],
      added: 0,
      alreadyThere: 2,
    });
  });

  it.each([
    ["further than a few metres away", { position: offDurbuy }],
    ["with another use", { use: "take-out" as const }],
    ["with another kind", { kind: "official-aire" as const }],
    ["with another note", { note: "Park by the mill" }],
    ["with another checked date", { checkedOnSite: null }],
  ])("keeps a point that differs: %s", (_, change) => {
    const other = { ...marked, id: "friend-1", ...change };
    expect(mergeAccessPoints([marked], [other], newId).accessPoints).toEqual([marked, other]);
  });

  it("gives an imported point a new id when its id is already taken by a different point", () => {
    const clash = { ...unchecked, id: marked.id };
    const merged = mergeAccessPoints([marked], [clash], () => "fresh");
    expect(merged.accessPoints).toEqual([marked, { ...clash, id: "fresh" }]);
  });

  it("does not add the same point twice from one file", () => {
    const twice = [unchecked, { ...unchecked, id: "copy" }];
    expect(mergeAccessPoints([], twice, newId)).toMatchObject({ accessPoints: [unchecked], added: 1, alreadyThere: 1 });
  });
});
