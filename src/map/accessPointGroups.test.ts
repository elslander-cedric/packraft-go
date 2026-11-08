import { describe, expect, it } from "vitest";
import { ACCESS_POINT_GROUP_DISTANCE_PX, groupNearby } from "./accessPointGroups";

const at = (item: string, x: number, y: number) => ({ item, x, y });

describe("grouping access points that would overlap", () => {
  it("keeps points apart when their markers don't overlap", () => {
    expect(groupNearby([at("a", 0, 0), at("b", ACCESS_POINT_GROUP_DISTANCE_PX, 0)])).toEqual([["a"], ["b"]]);
  });

  it("groups points whose markers would overlap", () => {
    expect(groupNearby([at("a", 0, 0), at("b", 10, 5), at("c", 3, 20)])).toEqual([["a", "b", "c"]]);
  });

  it("keeps separate piles apart", () => {
    expect(groupNearby([at("a", 0, 0), at("b", 200, 0), at("c", 5, 5), at("d", 205, 0)])).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("measures from a group's first member, so a chain doesn't grow without end", () => {
    expect(groupNearby([at("a", 0, 0), at("b", 20, 0), at("c", 40, 0)])).toEqual([["a", "b"], ["c"]]);
  });

  it("groups nothing when there is nothing", () => {
    expect(groupNearby([])).toEqual([]);
  });
});
