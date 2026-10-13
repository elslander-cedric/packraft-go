// Access points (#55, ADR 0023, GLOSSARY "Access point"): the planner's own
// collection, separate from trips. Edits, the versioned format, and merge-import.
import { describe, expect, it } from "vitest";
import { addAccessPoint, deleteAccessPoint, updateAccessPoint, type AccessPoint } from "./accessPoints";

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
