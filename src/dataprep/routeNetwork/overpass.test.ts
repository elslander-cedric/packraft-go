// The bank spot queries (ADR 0039): the paths are asked around points along the waters'
// lines, as the public server answered nothing around a line or a set of ways in many tiles.
import { describe, expect, it } from "vitest";
import type { OverpassResult } from "../walloonStretches/overpass";
import { bankPathPoints, bankPathQuery, bankWaterLines, bankWaterQuery, PATH_POINT_RADIUS_M } from "./overpass";

const TILE = [3.25, 51, 3.5, 51.2] as const;

const way = (id: number, tags: Record<string, string>, points: [number, number][]) => ({
  type: "way" as const,
  id,
  tags,
  nodes: points.map((_, i) => id * 100 + i),
  geometry: points.map(([lon, lat]) => ({ lat, lon })),
});

describe("bank spot queries", () => {
  it("asks for a tile's rivers, canals, weirs, dams and lock gates", () => {
    const query = bankWaterQuery(TILE);
    expect(query).toContain("[bbox:51,3.25,51.2,3.5]");
    expect(query).toContain('way["waterway"~"^(river|canal)$"]');
    expect(query).toContain('nw["waterway"~"^(dam|lock_gate|weir)$"]');
    expect(query).not.toContain("highway");
  });

  it("takes the named waters' lines inside the tile, simplified, and leaves the rest", () => {
    const answer: OverpassResult = {
      elements: [
        // Straight along 51.1 N from inside the tile to well outside it: its points out east are left.
        way(1, { waterway: "canal", name: "Canal" }, [
          [3.3, 51.1],
          [3.31, 51.1],
          [3.32, 51.1],
          [3.6, 51.1],
          [3.7, 51.1],
        ]),
        way(2, { waterway: "river" }, [
          [3.3, 51.05],
          [3.4, 51.05],
        ]),
        way(3, { waterway: "weir" }, [
          [3.3, 51.15],
          [3.31, 51.15],
        ]),
      ],
    };
    expect(bankWaterLines(answer, TILE)).toEqual([
      [
        [3.3, 51.1],
        [3.6, 51.1],
      ],
    ]);
  });

  it("asks for the paths and roads around points along each line, and their nodes near them", () => {
    // About 21 km along 51.1 N: a point every 350 m or so, from end to end.
    const line: [number, number][] = [
      [3.3, 51.1],
      [3.6, 51.1],
    ];
    const points = bankPathPoints([line]);
    expect(points[0]).toEqual([3.3, 51.1]);
    expect(points[points.length - 1]).toEqual([3.6, 51.1]);
    expect(points.length).toBeGreaterThan(55);
    expect(points.length).toBeLessThan(65);
    // The same line twice, as a canal's two banks may be: no point twice.
    expect(bankPathPoints([line, line])).toHaveLength(points.length);
    const query = bankPathQuery(TILE, [line]);
    expect(query).toContain(`way(around:${PATH_POINT_RADIUS_M},51.1,3.3)`);
    expect(query).toContain(`node(w.roads)(around:${PATH_POINT_RADIUS_M},51.1,3.6)`);
    expect(query).toContain('[!"bridge"]');
  });
});
