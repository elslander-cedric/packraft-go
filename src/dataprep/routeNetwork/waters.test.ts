// The waters outside Wallonia, from a recorded Overpass answer for the Demer and the Dijle
// around Werchter (`bankWaterQuery` and `bankPathQuery`), never from live OSM.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { distanceM } from "../walloonStretches/geo";
import type { OverpassElement, OverpassResult } from "../walloonStretches/overpass";
import { watersFromOsm } from "./waters";

const werchter: OverpassResult = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "demer-werchter.json"), "utf8"));
const waters = watersFromOsm(werchter);
const byId = new Map(waters.map((water) => [water.id, water]));
const first = (water: (typeof waters)[number]) => water.line[0];
const last = (water: (typeof waters)[number]) => water.line[water.line.length - 1];

describe("waters from OSM", () => {
  it("keeps only named rivers and canals", () => {
    expect(new Set(waters.map((water) => water.river))).toEqual(
      new Set(["Demer", "Dijle", "Kanaal Leuven-Dijle"]),
    );
  });

  it("runs the Demer into the Dijle at Werchter, the way OSM says it flows", () => {
    const demerIntoDijle = waters.filter(
      (water) => water.river === "Demer" && water.next !== undefined && byId.get(water.next)?.river === "Dijle",
    );
    expect(demerIntoDijle).toHaveLength(1);
    const [demer] = demerIntoDijle;
    const dijle = byId.get(demer.next!)!;
    expect(distanceM(last(demer), first(dijle))).toBeLessThan(1);
    // The Demer flows west into the Dijle, which flows north.
    expect(first(demer).lng).toBeGreaterThan(last(demer).lng);
    expect(last(dijle).lat).toBeGreaterThan(first(dijle).lat);
    expect(demer.canal || dijle.canal).toBe(false);
  });

  it("joins OSM ways end to end where the same water carries on, a canal whichever way its ways point", () => {
    const way = (id: number, waterway: string, nodes: number[]): OverpassElement => ({
      type: "way",
      id,
      nodes,
      tags: { waterway, name: waterway === "canal" ? "Canal" : "River" },
      geometry: nodes.map((node) => ({ lat: 51, lon: 4 + node / 1000 })),
    });
    const joinedUp = watersFromOsm({
      elements: [way(1, "river", [1, 2]), way(2, "river", [2, 3]), way(3, "canal", [11, 12]), way(4, "canal", [13, 12])],
    });
    expect(joinedUp.filter((water) => water.river === "River").map((water) => water.line.length)).toEqual([3]);
    expect(joinedUp.filter((water) => water.river === "Canal").map((water) => water.line.length)).toEqual([3, 3]);
  });

  it("has a canal both ways, so it can be paddled either way", () => {
    const canal = waters.filter((water) => water.river === "Kanaal Leuven-Dijle");
    expect(canal.length).toBeGreaterThanOrEqual(2);
    expect(canal.every((water) => water.canal)).toBe(true);
    for (const water of canal) {
      const reverse = canal.find(
        (other) => distanceM(first(other), last(water)) < 1 && distanceM(last(other), first(water)) < 1,
      );
      expect(reverse, water.id).toBeDefined();
    }
  });
});
