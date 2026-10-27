// #62: snapping a put-in or take-out to your access points, and the Walloon aire warning.
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "../access/builtInRules";
import { aireWarnings } from "./aire";
import { addAccessPoint, updateAccessPoint, type AccessPoints } from "./accessPoints";
import { newModeChanges, snapCandidate, snapOffers, snapToAccessPoint } from "./snap";
import { undoLastEdit } from "./edits";
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
const point = (id: string, at: LatLng, kind: "official-aire" | "slipway", use: "put-in" | "take-out" | "both" = "both"): AccessPoints =>
  updateAccessPoint(addAccessPoint([], { id, at, now: T }), id, { kind, use }, T);

describe("snap candidates", () => {
  const put = { kind: "put-in", point: 0 } as const;

  it("offers the nearest access point within 200 m", () => {
    const near = point("near", north(durbuy, 0.001), "slipway")[0];
    const closer = point("closer", north(durbuy, 0.0005), "slipway")[0];
    const offer = snapCandidate(trip(durbuy), put, [near, closer]);
    expect(offer?.accessPoint.id).toBe("closer");
    expect(offer?.distanceM).toBeGreaterThan(50);
  });

  it("offers nothing beyond 200 m, or when the point is already there", () => {
    expect(snapCandidate(trip(durbuy), put, point("far", north(durbuy, 0.003), "slipway"))).toBeUndefined();
    expect(snapCandidate(trip(durbuy), put, point("same", durbuy, "slipway"))).toBeUndefined();
  });

  it("respects the access point's use", () => {
    const takeOutOnly = point("t", north(durbuy, 0.001), "slipway", "take-out");
    expect(snapCandidate(trip(durbuy), put, takeOutOnly)).toBeUndefined();
    expect(snapCandidate(trip(durbuy), { kind: "take-out", point: 0 }, takeOutOnly)?.accessPoint.id).toBe("t");
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
    expect(snapOffers(before, after, points).map((o) => o.change)).toEqual([{ kind: "put-in", point: 0 }]);
  });

  it("adding a paddle leg after a hike leg offers to snap its put-in", () => {
    const before = trip(durbuy);
    const after = applyEdit(before, { type: "addPoint", at: north(durbuy, 0.02), mode: "paddle" });
    const near = point("b", north(durbuy, 0.011), "slipway");
    expect(snapOffers(before, after, near).map((o) => o.change)).toEqual([{ kind: "put-in", point: 1 }]);
  });

  it("an edit that shifts the points offers nothing", () => {
    const before = trip(durbuy);
    const paddling = applyEdit(before, { type: "setLegMode", index: 0, mode: "paddle" });
    const inserted = applyEdit(paddling, { type: "insertPoint", index: 0, near: north(durbuy, 0.005) });
    expect(snapOffers(before, inserted, point("a", north(durbuy, 0.011), "slipway"))).toEqual([]);
  });

  it("an edit that is not a mode change offers nothing", () => {
    const paddling = trip(durbuy, "paddle");
    const moved = applyEdit(paddling, { type: "movePoint", index: 0, to: north(durbuy, 0.0001) });
    expect(snapOffers(paddling, moved, points)).toEqual([]);
  });
});

describe("accepting a snap", () => {
  it("moves the point onto the access point, as one undoable edit; declining changes nothing", () => {
    const before = trip(durbuy);
    const paddling = applyEdit(before, { type: "setLegMode", index: 0, mode: "paddle" });
    const [offer] = snapOffers(before, paddling, point("a", north(durbuy, 0.001), "slipway"));
    const snapped = snapToAccessPoint(paddling, offer);
    expect(snapped.points[0]).toEqual(north(durbuy, 0.001));
    expect(snapped.legs[0].route).toBeUndefined();
    expect(undoLastEdit(snapped).points[0]).toEqual(durbuy);
    expect(paddling.points[0]).toEqual(durbuy);
  });
});

describe("the Walloon aire warning", () => {
  const paddling = (a: LatLng): Trip => trip(a, "paddle");

  it("warns on a Walloon put-in and take-out without an official aire nearby", () => {
    const warnings = aireWarnings(paddling(durbuy), builtInAccessRules, []);
    expect(warnings.map((w) => [w.kind, w.point, w.leg, w.day])).toEqual([
      ["put-in", 0, 0, 0],
      ["take-out", 1, 0, 0],
    ]);
  });

  it("an official aire within 200 m removes that warning; a slipway does not", () => {
    const aire = point("aire", north(durbuy, 0.001), "official-aire");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, aire).map((w) => w.kind)).toEqual(["take-out"]);
    const slipway = point("slip", north(durbuy, 0.001), "slipway");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, slipway)).toHaveLength(2);
  });

  it("an official aire further than 200 m does not count", () => {
    const aire = point("aire", north(durbuy, 0.003), "official-aire");
    expect(aireWarnings(paddling(durbuy), builtInAccessRules, aire).map((w) => w.kind)).toContain("put-in");
  });

  it("no warning outside Wallonia, and none for a hike", () => {
    expect(aireWarnings(paddling(ghent), builtInAccessRules, [])).toEqual([]);
    expect(aireWarnings(trip(durbuy), builtInAccessRules, [])).toEqual([]);
  });

  it("carries the day's date for a dated trip", () => {
    const dated = { ...paddling(durbuy), startDate: "2026-07-10" };
    expect(aireWarnings(dated, builtInAccessRules, [])[0].date).toBe("2026-07-10");
  });
});
