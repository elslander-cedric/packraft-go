// #62: snapping a put-in or take-out to your access points, and the Walloon aire warning.
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "../access/builtInRules";
import { aireWarnings } from "./aire";
import { addAccessPoint, updateAccessPoint, type AccessPoints } from "./accessPoints";
import { acceptSnap, newModeChanges, snapCandidate, snapOffers } from "./snap";
import { undoLastEdit } from "./edits";
import type { OfficialAire } from "./officialAire";
import { applyEdit, type LatLng, type Trip } from "./trip";

const T = "2026-10-14T08:00:00.000Z";
// Durbuy is in Wallonia; Ghent is in Flanders. 0.001 degrees of latitude is about 111 m.
const durbuy: LatLng = { lat: 50.3527, lng: 5.4563 };
const north = (p: LatLng, degrees: number): LatLng => ({ lat: p.lat + degrees, lng: p.lng });
const ghent: LatLng = { lat: 51.05, lng: 3.72 };

const trip = (a: LatLng, mode: "hike" | "paddle" = "hike"): Trip => ({
  name: "",
  points: [a, north(a, 0.01)],
  legs: [{ mode }],
});
const point = (
  id: string,
  at: LatLng,
  kind: "official-aire" | "slipway",
  use: "put-in" | "take-out" | "both" = "both",
): AccessPoints => updateAccessPoint(addAccessPoint([], { id, at, now: T }), id, { kind, use }, T);

/** A faked official aire: built-in positions are [lng, lat], unlike your access points. */
const officialAire = (id: string, at: LatLng, use: OfficialAire["use"] = "both"): OfficialAire => ({
  id,
  number: 1,
  name: `Aire ${id}`,
  use,
  officialStretch: "OURTHE1",
  position: [at.lng, at.lat],
  lastChanged: "2016-05-02",
  source: { title: "SPW", url: "https://example.test" },
  snapshot: "2026-11-02",
});

describe("snap candidates", () => {
  const put = { kind: "put-in", point: 0 } as const;

  it("offers the nearest access point within 200 m", () => {
    const near = point("near", north(durbuy, 0.001), "slipway")[0];
    const closer = point("closer", north(durbuy, 0.0005), "slipway")[0];
    const offer = snapCandidate(trip(durbuy), put, [near, closer], []);
    expect(offer?.target).toEqual({ kind: "access-point", accessPoint: closer });
    expect(offer?.distanceM).toBeGreaterThan(50);
  });

  it("offers nothing beyond 200 m, or when the point is already there", () => {
    expect(snapCandidate(trip(durbuy), put, point("far", north(durbuy, 0.003), "slipway"), [])).toBeUndefined();
    expect(snapCandidate(trip(durbuy), put, point("same", durbuy, "slipway"), [])).toBeUndefined();
  });

  it("respects the access point's use", () => {
    const takeOutOnly = point("t", north(durbuy, 0.001), "slipway", "take-out");
    expect(snapCandidate(trip(durbuy), put, takeOutOnly, [])).toBeUndefined();
    expect(snapCandidate(trip(durbuy), { kind: "take-out", point: 0 }, takeOutOnly, [])?.target).toEqual({
      kind: "access-point",
      accessPoint: takeOutOnly[0],
    });
  });
});

describe("snap candidates with built-in official aires", () => {
  const put = { kind: "put-in", point: 0 } as const;
  const takeOut = { kind: "take-out", point: 0 } as const;
  const near = north(durbuy, 0.001);

  it("offers an official aire within 200 m and tells how far it is", () => {
    const aire = officialAire("a", near);
    const offer = snapCandidate(trip(durbuy), put, [], [aire]);
    expect(offer?.target).toEqual({ kind: "official-aire", aire });
    expect(offer?.distanceM).toBeGreaterThan(100);
    expect(offer?.distanceM).toBeLessThan(120);
  });

  it("offers nothing beyond 200 m, or when the point is already at the aire", () => {
    expect(snapCandidate(trip(durbuy), put, [], [officialAire("far", north(durbuy, 0.003))])).toBeUndefined();
    expect(snapCandidate(trip(durbuy), put, [], [officialAire("same", durbuy)])).toBeUndefined();
  });

  it("honours the aire's use", () => {
    const takeOutOnly = officialAire("t", near, "take-out");
    expect(snapCandidate(trip(durbuy), put, [], [takeOutOnly])).toBeUndefined();
    expect(snapCandidate(trip(durbuy), takeOut, [], [takeOutOnly])?.target).toEqual({
      kind: "official-aire",
      aire: takeOutOnly,
    });
  });

  it("the nearest target wins, whichever kind it is", () => {
    const mine = point("mine", near, "slipway");
    const closerAire = officialAire("closer", north(durbuy, 0.0005));
    const furtherAire = officialAire("further", north(durbuy, 0.0015));
    expect(snapCandidate(trip(durbuy), put, mine, [furtherAire, closerAire])?.target).toEqual({
      kind: "official-aire",
      aire: closerAire,
    });
    expect(snapCandidate(trip(durbuy), put, mine, [furtherAire])?.target).toEqual({
      kind: "access-point",
      accessPoint: mine[0],
    });
  });

  it("your own point wins a tie: you marked that spot yourself", () => {
    const mine = point("mine", near, "slipway");
    const offer = snapCandidate(trip(durbuy), put, mine, [officialAire("a", near)]);
    expect(offer?.target.kind).toBe("access-point");
  });
});

describe("snap offers after a mode change", () => {
  const points = point("a", north(durbuy, 0.001), "slipway");

  it("switching a leg to paddle makes new put-in and take-out, and offers to snap them", () => {
    const before = trip(durbuy);
    const after = applyEdit(before, { type: "setLegMode", index: 0, mode: "paddle" });
    expect(newModeChanges(before, after)).toEqual([
      { kind: "put-in", point: 0 },
      { kind: "take-out", point: 1 },
    ]);
    expect(snapOffers(before, after, points, []).map((o) => o.change)).toEqual([{ kind: "put-in", point: 0 }]);
  });

  it("adding a paddle leg after a hike leg offers to snap its put-in", () => {
    const before = trip(durbuy);
    const after = applyEdit(before, { type: "addPoint", at: north(durbuy, 0.02), mode: "paddle" });
    const near = point("b", north(durbuy, 0.011), "slipway");
    expect(snapOffers(before, after, near, []).map((o) => o.change)).toEqual([{ kind: "put-in", point: 1 }]);
  });

  it("an edit that shifts the points offers nothing", () => {
    const before = trip(durbuy);
    const paddling = applyEdit(before, { type: "setLegMode", index: 0, mode: "paddle" });
    const inserted = applyEdit(paddling, { type: "insertPoint", index: 0, near: north(durbuy, 0.005) });
    expect(snapOffers(before, inserted, point("a", north(durbuy, 0.011), "slipway"), [])).toEqual([]);
  });

  it("an edit that is not a mode change offers nothing", () => {
    const paddling = trip(durbuy, "paddle");
    const moved = applyEdit(paddling, { type: "movePoint", index: 0, to: north(durbuy, 0.0001) });
    expect(snapOffers(paddling, moved, points, [])).toEqual([]);
  });
});

describe("accepting a snap", () => {
  it("moves the point onto the access point, as one undoable edit; declining changes nothing", () => {
    const before = trip(durbuy);
    const paddling = applyEdit(before, { type: "setLegMode", index: 0, mode: "paddle" });
    const [offer] = snapOffers(before, paddling, point("a", north(durbuy, 0.001), "slipway"), []);
    const snapped = acceptSnap(paddling, offer);
    expect(snapped.points[0]).toEqual(north(durbuy, 0.001));
    expect(snapped.legs[0].route).toBeUndefined();
    expect(undoLastEdit(snapped).points[0]).toEqual(durbuy);
    expect(paddling.points[0]).toEqual(durbuy);
  });
});

describe("accepting a snap onto an official aire", () => {
  const before = trip(durbuy);
  const paddling = applyEdit(before, { type: "setLegMode", index: 0, mode: "paddle" });
  const aire = north(durbuy, 0.001);
  const [offer] = snapOffers(before, paddling, [], [officialAire("a", aire)]);

  it("moves the point onto the aire, at its real position, as one undoable edit", () => {
    const snapped = acceptSnap(paddling, offer);
    expect(snapped.points[0]).toEqual(aire);
    expect(undoLastEdit(snapped).points[0]).toEqual(durbuy);
  });

  it("clears the put-in's warning", () => {
    const aires = [officialAire("a", aire)];
    expect(aireWarnings(paddling, builtInAccessRules, [], aires).map((w) => w.kind)).toEqual(["take-out"]);
    expect(aireWarnings(paddling, builtInAccessRules, [], []).map((w) => w.kind)).toEqual(["put-in", "take-out"]);
    const snapped = acceptSnap(paddling, offer);
    expect(aireWarnings(snapped, builtInAccessRules, [], aires).map((w) => w.kind)).toEqual(["take-out"]);
  });
});

describe("the Walloon aire warning", () => {
  const paddling = (a: LatLng): Trip => trip(a, "paddle");

  it("warns on a Walloon put-in and take-out without an official aire nearby", () => {
    const warnings = aireWarnings(paddling(durbuy), builtInAccessRules, [], []);
    expect(warnings.map((w) => [w.kind, w.point, w.leg, w.day])).toEqual([
      ["put-in", 0, 0, 0],
      ["take-out", 1, 0, 0],
    ]);
  });

  it("an official aire within 200 m removes that warning; a slipway does not", () => {
    const aire = point("aire", north(durbuy, 0.001), "official-aire");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, aire, []).map((w) => w.kind)).toEqual(["take-out"]);
    const slipway = point("slip", north(durbuy, 0.001), "slipway");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, slipway, [])).toHaveLength(2);
  });

  it("an official aire further than 200 m does not count", () => {
    const aire = point("aire", north(durbuy, 0.003), "official-aire");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, aire, []).map((w) => w.kind)).toContain("put-in");
  });

  describe("with built-in official aires", () => {
    const kindsWarned = (use: OfficialAire["use"], at: LatLng) =>
      aireWarnings(paddling(durbuy), builtInAccessRules, [], [officialAire("a", at, use)]).map((w) => w.kind);
    const nearPutIn = north(durbuy, 0.001);
    const nearTakeOut = north(durbuy, 0.009);

    it("a put-in within 200 m of a put-in or both-ways aire has no warning", () => {
      expect(kindsWarned("put-in", nearPutIn)).toEqual(["take-out"]);
      expect(kindsWarned("both", nearPutIn)).toEqual(["take-out"]);
    });

    it("a take-out within 200 m of a take-out or both-ways aire has no warning", () => {
      expect(kindsWarned("take-out", nearTakeOut)).toEqual(["put-in"]);
      expect(kindsWarned("both", nearTakeOut)).toEqual(["put-in"]);
    });

    it("a put-in at a take-out-only aire still warns, and a take-out at a put-in-only aire", () => {
      expect(kindsWarned("take-out", nearPutIn)).toEqual(["put-in", "take-out"]);
      expect(kindsWarned("put-in", nearTakeOut)).toEqual(["put-in", "take-out"]);
    });

    it("an aire further than 200 m does not count", () => {
      expect(kindsWarned("both", north(durbuy, 0.003))).toEqual(["put-in", "take-out"]);
    });
  });

  it("your own official-aire mark counts whatever its use", () => {
    const takeOutOnly = point("mark", north(durbuy, 0.001), "official-aire", "take-out");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, takeOutOnly, []).map((w) => w.kind)).toEqual([
      "take-out",
    ]);
  });

  it("no warning outside Wallonia, and none for a hike", () => {
    expect(aireWarnings(paddling(ghent), builtInAccessRules, [], [])).toEqual([]);
    expect(aireWarnings(trip(durbuy), builtInAccessRules, [], [])).toEqual([]);
  });

  it("carries the day's date for a dated trip", () => {
    const dated = { ...paddling(durbuy), startDate: "2026-07-10" };
    expect(aireWarnings(dated, builtInAccessRules, [], [])[0].date).toBe("2026-07-10");
  });
});
