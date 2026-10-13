// Seam 3: the OpenStreetMap preparation steps, on small saved Overpass answers.
import { describe, expect, it } from "vitest";
import {
  areasOf,
  clipLine,
  cutBetween,
  mergeLines,
  relationArea,
  roundPosition,
  simplifyLine,
  waysOf,
  type OverpassResponse,
} from "./osm";

const pt = (lon: number, lat: number) => ({ lat, lon });

/** A boundary relation: a square outer ring split over two ways (one reversed) and a square hole. */
const boundary: OverpassResponse = {
  elements: [
    {
      type: "relation",
      id: 1,
      tags: { boundary: "administrative" },
      members: [
        { type: "way", ref: 10, role: "outer", geometry: [pt(0, 0), pt(1, 0), pt(1, 1)] },
        { type: "way", ref: 11, role: "outer", geometry: [pt(0, 0), pt(0, 1), pt(1, 1)] },
        { type: "way", ref: 12, role: "inner", geometry: [pt(0.4, 0.4), pt(0.6, 0.4), pt(0.6, 0.6), pt(0.4, 0.6), pt(0.4, 0.4)] },
        { type: "node", ref: 99, role: "admin_centre" },
      ],
    },
  ],
};

describe("OSM preparation", () => {
  it("assembles a relation's ways into an outer ring with its hole", () => {
    const area = relationArea(boundary, 1);
    expect(area).toHaveLength(1);
    expect(area[0]).toHaveLength(2);
    expect(area[0][0]).toHaveLength(5);
    expect(area[0][0][0]).toEqual(area[0][0][4]);
    expect(area[0][1]).toHaveLength(5);
  });

  it("fails clearly when the relation is missing", () => {
    expect(() => relationArea({ elements: [] }, 7)).toThrow(/relation 7/);
  });

  it("joins ways that share end points into one line, whatever their direction", () => {
    const merged = mergeLines([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].map((p) => p[0]).sort()).toEqual([0, 1, 2, 3]);
  });

  it("takes ways from top-level ways and relation members, filtering top-level ways by tags", () => {
    const answer: OverpassResponse = {
      elements: [
        { type: "way", id: 1, tags: { name: "Groenerei" }, geometry: [pt(3.2, 51.2), pt(3.21, 51.2)] },
        { type: "way", id: 2, tags: { name: "Smedenvest" }, geometry: [pt(3.3, 51.2), pt(3.31, 51.2)] },
        { type: "relation", id: 3, members: [{ type: "way", ref: 4, role: "", geometry: [pt(4, 51), null, pt(4.1, 51)] }] },
      ],
    };
    const lines = waysOf(answer, (tags) => /rei$/.test(tags.name ?? ""));
    expect(lines).toEqual([
      [
        [3.2, 51.2],
        [3.21, 51.2],
      ],
      [
        [4, 51],
        [4.1, 51],
      ],
    ]);
  });

  it("reads closed ways with matching tags as areas", () => {
    const answer: OverpassResponse = {
      elements: [
        { type: "way", id: 1, tags: { water: "harbour" }, geometry: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)] },
        { type: "way", id: 2, tags: { water: "pond" }, geometry: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 0)] },
        { type: "way", id: 3, tags: { water: "harbour" }, geometry: [pt(0, 0), pt(1, 0)] },
      ],
    };
    expect(areasOf(answer, (tags) => tags.water === "harbour")).toHaveLength(1);
  });

  it("simplifies a line, dropping vertices less than the tolerance off it and keeping the ends", () => {
    // 0.0001° of latitude is about 11 m.
    const line = [
      [4, 51],
      [4.001, 51.00001],
      [4.002, 51],
      [4.003, 51.001],
      [4.004, 51],
    ] as const;
    expect(simplifyLine(line, 5)).toEqual([
      [4, 51],
      [4.002, 51],
      [4.003, 51.001],
      [4.004, 51],
    ]);
  });

  it("clips a line to the parts inside a limit", () => {
    const line = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ] as const;
    expect(clipLine(line, ([x]) => x !== 2)).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [3, 0],
        [4, 0],
        [5, 0],
      ],
    ]);
  });

  it("cuts the part of a line between two places, in either order", () => {
    const line = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ] as const;
    expect(cutBetween(line, [2.1, 0.1], [0.9, -0.1])).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });

  it("rounds to five decimals", () => {
    expect(roundPosition([4.123456789, 51.000004])).toEqual([4.12346, 51]);
  });
});
