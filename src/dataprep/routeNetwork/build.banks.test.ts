// The route network outside Wallonia (ADR 0039): bank spots as nodes and the paddle links
// between them, from a recorded Overpass answer for the Demer around Werchter and from small
// hand-made answers, with the built-in access rules. Never live OSM.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "@/access/builtInRules";
import type { OverpassElement, OverpassResult } from "../walloonStretches/overpass";
import { buildRouteNetwork, type NetworkInputs } from "./build";

const werchter: OverpassResult = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "demer-werchter.json"), "utf8"));

function inputs(osm: OverpassResult, overrides: Partial<NetworkInputs> = {}): NetworkInputs {
  return {
    records: [],
    osm: {},
    aires: [],
    obstacles: [],
    locks: [],
    banks: { osm, rules: builtInAccessRules },
    sources: [{ title: "Test", url: "https://example.org" }],
    snapshot: "2026-11-15",
    ...overrides,
  };
}

/** Near Beernem in Flanders, on no listed water: open by the region's rule. */
const LAT = 51.15;
const lng = (i: number) => 3.4 + i * 0.005;

/** A water flowing east along LAT, 17 OSM nodes about 350 m apart (5.6 km). */
function water(waterway: "river" | "canal", extra: OverpassElement[] = []): OverpassResult {
  const nodes = Array.from({ length: 17 }, (_, i) => 100 + i);
  return {
    elements: [
      {
        type: "way",
        id: 1,
        nodes,
        tags: { waterway, name: "Testbeek" },
        geometry: nodes.map((_, i) => ({ lat: LAT, lon: lng(i) })),
      },
      // Path nodes 10 m from the bank near each end.
      { type: "node", id: 201, lat: LAT + 0.0001, lon: lng(0.2) },
      { type: "node", id: 202, lat: LAT + 0.0001, lon: lng(15.8) },
      ...extra,
    ],
  };
}

describe("bank spots in the route network", () => {
  it("are nodes, used both to get in and out", () => {
    const { network } = buildRouteNetwork(inputs(werchter));
    const spots = network.nodes.filter((node) => node.kind === "bank-spot");
    expect(spots.length).toBeGreaterThanOrEqual(2);
    for (const spot of spots) expect(spot).toMatchObject({ id: expect.stringMatching(/^bank-spot-\d+$/), use: "both" });
  });

  it("are linked downstream along the Demer, with the access records of the water they paddle", () => {
    const { network } = buildRouteNetwork(inputs(werchter));
    const demer = network.paddleLinks.filter((link) => link.waters.includes("Demer"));
    expect(demer).toHaveLength(1);
    const [link] = demer;
    expect(link).toMatchObject({ direction: "downstream", waters: ["Demer"], records: ["flanders"], obstacles: [] });
    const from = network.nodes.find((node) => node.id === link.from)!;
    const to = network.nodes.find((node) => node.id === link.to)!;
    // The Demer flows west to Werchter.
    expect(from.position[0]).toBeGreaterThan(to.position[0]);
    expect(link.distanceM).toBeGreaterThan(4000);
    expect(link.distanceM).toBeLessThan(6500);
  });

  it("are linked once on a canal, paddled either way", () => {
    const { network } = buildRouteNetwork(inputs(water("canal")));
    expect(network.paddleLinks).toHaveLength(1);
    expect(network.paddleLinks[0]).toMatchObject({
      from: "bank-spot-201",
      to: "bank-spot-202",
      direction: "both",
      waters: ["Testbeek"],
      records: ["flanders"],
    });
  });

  it("are not linked past a weir, a dam or a lock gate", () => {
    for (const waterway of ["weir", "dam", "lock_gate"]) {
      const barrier: OverpassElement = { type: "node", id: 300, lat: LAT, lon: lng(8), tags: { waterway } };
      const { network, report } = buildRouteNetwork(inputs(water("river", [barrier])));
      expect(network.paddleLinks, waterway).toEqual([]);
      expect(report.broken, waterway).toEqual([{ from: "bank-spot-201", to: "bank-spot-202", barrier: "osm-node-300" }]);
    }
  });

  it("are not linked past a lock", () => {
    const lock = { id: "lock-1", position: [lng(8), LAT] as const };
    const { network } = buildRouteNetwork(inputs(water("river"), { locks: [lock] }));
    expect(network.paddleLinks).toEqual([]);
  });
});
