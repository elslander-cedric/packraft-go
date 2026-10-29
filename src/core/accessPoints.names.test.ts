// Access point names (#136, ADR 0027, GLOSSARY "Access point", "Default name"):
// a name you type, or else a default name from the nearest road and place.
import { describe, expect, it } from "vitest";
import {
  addAccessPoint,
  applyDefaultName,
  parseAccessPoints,
  serialiseAccessPoints,
  toLookUp,
  updateAccessPoint,
  type AccessPoint,
} from "./accessPoints";

const T1 = "2026-10-13T08:00:00.000Z";
const T2 = "2026-10-14T09:30:00.000Z";

const hotton = { lat: 50.268, lng: 5.446 };
const durbuy = { lat: 50.3527, lng: 5.4563 };

const point: AccessPoint = {
  id: "a",
  position: hotton,
  name: "Hotton bridge",
  nameSource: "typed",
  use: "put-in",
  kind: "slipway",
  note: "",
  checkedOnSite: null,
  createdAt: T1,
  updatedAt: T1,
};

const file = (points: unknown) => JSON.stringify({ format: "packraft-go-access-points", version: 1, accessPoints: points });

/** A point as stored by an earlier build, before names (#136). */
function withoutName(stored: AccessPoint) {
  return Object.fromEntries(Object.entries(stored).filter(([key]) => key !== "name" && key !== "nameSource"));
}

describe("a new access point", () => {
  it("has no name yet and a default name to look up", () => {
    const [added] = addAccessPoint([], { id: "a", at: hotton, now: T1 });
    expect(added).toMatchObject({ name: "", nameSource: "to-look-up" });
    expect(toLookUp([added])).toEqual([added]);
  });
});

describe("default name", () => {
  const fresh = addAccessPoint([], { id: "a", at: hotton, now: T1 });

  it("fills in the name found for the point's position, without changing when it was changed", () => {
    const [named] = applyDefaultName(fresh, "a", { at: hotton, name: "Rue du Moulin, Hotton" });
    expect(named).toMatchObject({ name: "Rue du Moulin, Hotton", nameSource: "default", updatedAt: T1 });
    expect(toLookUp([named])).toEqual([]);
  });

  it("when nothing is found, stays empty and is not looked up again", () => {
    const [unnamed] = applyDefaultName(fresh, "a", { at: hotton, name: "" });
    expect(unnamed).toMatchObject({ name: "", nameSource: "default" });
    expect(toLookUp([unnamed])).toEqual([]);
  });

  it("is cleared and looked up again when the point moves: the old place's name would be wrong", () => {
    const named = applyDefaultName(fresh, "a", { at: hotton, name: "Rue du Moulin, Hotton" });
    const [moved] = updateAccessPoint(named, "a", { position: durbuy }, T2);
    expect(moved).toMatchObject({ name: "", nameSource: "to-look-up" });
    expect(toLookUp([moved])).toEqual([moved]);
  });

  it("an answer for a position the point has since left is ignored", () => {
    const moved = updateAccessPoint(fresh, "a", { position: durbuy }, T2);
    expect(applyDefaultName(moved, "a", { at: hotton, name: "Rue du Moulin, Hotton" })).toBe(moved);
  });

  it("an answer that arrives after you typed a name is ignored", () => {
    const typed = updateAccessPoint(fresh, "a", { name: "R3" }, T2);
    expect(applyDefaultName(typed, "a", { at: hotton, name: "Rue du Moulin, Hotton" })).toBe(typed);
  });
});

describe("a name you type", () => {
  const named = applyDefaultName(addAccessPoint([], { id: "a", at: hotton, now: T1 }), "a", {
    at: hotton,
    name: "Rue du Moulin, Hotton",
  });

  it("replaces the default name and is never changed automatically, even when the point moves", () => {
    const typed = updateAccessPoint(named, "a", { name: "Hotton bridge" }, T2);
    expect(typed[0]).toMatchObject({ name: "Hotton bridge", nameSource: "typed", updatedAt: T2 });
    const [moved] = updateAccessPoint(typed, "a", { position: durbuy }, T2);
    expect(moved).toMatchObject({ name: "Hotton bridge", nameSource: "typed" });
    expect(toLookUp([moved])).toEqual([]);
  });

  it("includes a default name you edited", () => {
    const [edited] = updateAccessPoint(named, "a", { name: "Rue du Moulin, Hotton (north bank)" }, T2);
    expect(edited.nameSource).toBe("typed");
  });

  it.each([["empty", ""], ["only spaces", "   "]])("cleared (%s) becomes a default name to look up again", (_, cleared) => {
    const typed = updateAccessPoint(named, "a", { name: "Hotton bridge" }, T2);
    const [again] = updateAccessPoint(typed, "a", { name: cleared }, T2);
    expect(again).toMatchObject({ name: "", nameSource: "to-look-up" });
    expect(toLookUp([again])).toEqual([again]);
  });
});

describe("names in the access points format (still version 1)", () => {
  const defaultNamed: AccessPoint = { ...point, id: "b", name: "Rue du Moulin, Hotton", nameSource: "default" };
  const pending: AccessPoint = { ...point, id: "c", name: "", nameSource: "to-look-up" };

  it("round-trips a typed name, a default name and a name still to look up", () => {
    expect(parseAccessPoints(serialiseAccessPoints([point, defaultNamed, pending]))).toEqual({
      ok: true,
      accessPoints: [point, defaultNamed, pending],
    });
  });

  it("reads a point without a name as unnamed, with a default name to look up", () => {
    expect(parseAccessPoints(file([withoutName(point)]))).toEqual({
      ok: true,
      accessPoints: [{ ...point, name: "", nameSource: "to-look-up" }],
    });
  });

  it("reads a name without its source as a name you typed", () => {
    expect(parseAccessPoints(file([{ ...withoutName(point), name: "R3" }]))).toEqual({
      ok: true,
      accessPoints: [{ ...point, name: "R3", nameSource: "typed" }],
    });
  });

  it("reads a blank typed name as unnamed", () => {
    expect(parseAccessPoints(file([{ ...point, name: "  " }]))).toMatchObject({
      accessPoints: [{ name: "", nameSource: "to-look-up" }],
    });
  });

  it.each([
    ["a name that is not text", { name: 3 }],
    ["an unknown name source", { nameSource: "guessed" }],
  ])("refuses an invalid file (%s)", (_, change) => {
    expect(parseAccessPoints(file([{ ...point, ...change }]))).toEqual({ ok: false });
  });
});
