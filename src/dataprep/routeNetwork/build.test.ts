// The route network preparation (ADR 0039), tested on a recorded Overpass answer for the
// Lesse from the Anseremme weir to the Meuse (record 1A2), never on live OSM.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Position } from "@/core/geo";
import type { OverpassResult } from "../walloonStretches/overpass";
import { buildRouteNetwork, type NetworkInputs } from "./build";

type Fixture = { record: { id: string; river: string; line: Position[] }; overpass: OverpassResult };
const lesse: Fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "lesse-1A2.json"), "utf8"));

// Just below the Anseremme weir (upstream) and just above the Meuse confluence (downstream).
const BELOW_WEIR: Position = [4.9046, 50.2272];
const ABOVE_MEUSE: Position = [4.9123, 50.2393];
const MIDWAY: Position = lesse.record.line[16];

const record = { id: "walloon-1A2", river: "Lesse", line: lesse.record.line };

function inputs(overrides: Partial<NetworkInputs> = {}): NetworkInputs {
  return {
    records: [record],
    osm: { "walloon-1A2": lesse.overpass },
    aires: [
      { id: "official-aire-2", use: "take-out", position: ABOVE_MEUSE },
      { id: "official-aire-1", use: "put-in", position: BELOW_WEIR },
    ],
    obstacles: [],
    locks: [],
    sources: [{ title: "Test", url: "https://example.org" }],
    snapshot: "2026-11-15",
    ...overrides,
  };
}

describe("paddle links on a river", () => {
  it("links two aires on the water downstream, along the water", () => {
    const { network } = buildRouteNetwork(inputs());
    expect(network.paddleLinks).toHaveLength(1);
    const [link] = network.paddleLinks;
    expect(link).toMatchObject({
      from: "official-aire-1",
      to: "official-aire-2",
      direction: "downstream",
      waters: ["Lesse"],
      records: ["walloon-1A2"],
      obstacles: [],
    });
    // The Lesse below the weir runs about 2.4 km to the Meuse: much longer than the 1.5 km straight line.
    expect(link.distanceM).toBeGreaterThan(2000);
    expect(link.distanceM).toBeLessThan(2800);
  });
});

/** The way OSM names "Lesse", which carries the whole record. */
const LESSE_WAY = 1087590733;
/** The Lesse way cut in two near the record's downstream end, with the short downstream part drawn backwards. */
function lesseEndBackwards(): OverpassResult {
  const [cutLng, cutLat] = record.line[24];
  const offM = (point: { lat: number; lon: number } | null) =>
    point ? Math.hypot(point.lon - cutLng, point.lat - cutLat) : Infinity;
  return {
    elements: lesse.overpass.elements.flatMap((element) => {
      if (element.id !== LESSE_WAY) {
        return [element];
      }
      const geometry = element.geometry ?? [];
      const at = geometry.reduce((best, point, i) => (offM(point) < offM(geometry[best]) ? i : best), 0);
      return [
        { ...element, geometry: geometry.slice(0, at + 1) },
        { ...element, id: 1, geometry: geometry.slice(at).reverse() },
      ];
    }),
  };
}
const pairs = (network: { paddleLinks: readonly { from: string; to: string }[] }) =>
  network.paddleLinks.map(({ from, to }) => [from, to]);

describe("direction of flow", () => {
  it("follows OSM's waterway direction, whichever way the record's line is drawn", () => {
    const backwards = { ...record, line: [...record.line].reverse() };
    const { network } = buildRouteNetwork(inputs({ records: [backwards] }));
    expect(pairs(network)).toEqual([["official-aire-1", "official-aire-2"]]);
  });

  it("reports a record whose OSM ways disagree on direction, and goes with the longer side", () => {
    const { network, report } = buildRouteNetwork(
      inputs({ osm: { "walloon-1A2": lesseEndBackwards() } }),
    );
    expect(report.disagreeing).toEqual([expect.objectContaining({ record: "walloon-1A2", river: "Lesse" })]);
    expect(report.disagreeing[0].againstM).toBeGreaterThan(100);
    expect(pairs(network)).toEqual([["official-aire-1", "official-aire-2"]]);
  });

  it("reports no disagreement when the ways agree", () => {
    expect(buildRouteNetwork(inputs()).report.disagreeing).toEqual([]);
  });

  it("paddles a canal either way", () => {
    const canal: OverpassResult = {
      elements: lesse.overpass.elements.map((element) =>
        element.tags?.waterway === "river" ? { ...element, tags: { ...element.tags, waterway: "canal" } } : element,
      ),
    };
    const { network } = buildRouteNetwork(inputs({ osm: { "walloon-1A2": canal } }));
    expect(network.paddleLinks.map((link) => link.direction)).toEqual(["both"]);
  });

  it("makes no links on a record with no OSM way along it, and reports it", () => {
    const { network, report } = buildRouteNetwork(inputs({ osm: {} }));
    expect(network.paddleLinks).toEqual([]);
    expect(report.withoutOsm).toEqual(["walloon-1A2"]);
  });
});

describe("nodes", () => {
  it("keeps every aire as a node with its use and position", () => {
    const { network } = buildRouteNetwork(inputs());
    expect(network.nodes).toEqual([
      { id: "official-aire-2", kind: "official-aire", use: "take-out", position: ABOVE_MEUSE },
      { id: "official-aire-1", kind: "official-aire", use: "put-in", position: BELOW_WEIR },
    ]);
  });

  it("links only aires next to each other along the water", () => {
    const { network } = buildRouteNetwork(
      inputs({ aires: [...inputs().aires, { id: "official-aire-3", use: "both", position: MIDWAY }] }),
    );
    expect(pairs(network)).toEqual([
      ["official-aire-1", "official-aire-3"],
      ["official-aire-3", "official-aire-2"],
    ]);
  });

  it("reports an aire on no record's water", () => {
    const { network, report } = buildRouteNetwork(
      inputs({ aires: [...inputs().aires, { id: "official-aire-9", use: "both", position: [4.95, 50.25] }] }),
    );
    expect(report.airesOffWater).toEqual(["official-aire-9"]);
    expect(network.nodes.map((node) => node.id)).toContain("official-aire-9");
  });
});

describe("barriers and obstacles", () => {
  it("makes no link past a dam or an impassable obstacle, and reports it", () => {
    for (const kind of ["dam", "impassable"] as const) {
      const { network, report } = buildRouteNetwork(inputs({ obstacles: [{ id: "obstacle-7", kind, position: MIDWAY }] }));
      expect(network.paddleLinks).toEqual([]);
      expect(report.broken).toEqual([{ from: "official-aire-1", to: "official-aire-2", barrier: "obstacle-7" }]);
    }
  });

  it("makes no link past a lock", () => {
    const { network } = buildRouteNetwork(inputs({ locks: [{ id: "lock-1", position: MIDWAY }] }));
    expect(network.paddleLinks).toEqual([]);
  });

  it("makes no link past a dam mapped in OSM", () => {
    const dam = { type: "node" as const, id: 1, lat: MIDWAY[1], lon: MIDWAY[0], tags: { waterway: "dam" } };
    const { network, report } = buildRouteNetwork(
      inputs({ osm: { "walloon-1A2": { elements: [...lesse.overpass.elements, dam] } } }),
    );
    expect(network.paddleLinks).toEqual([]);
    expect(report.broken.map((broken) => broken.barrier)).toEqual(["osm-node-1"]);
  });

  it("is not broken by the lock gates on the Meuse next to the confluence", () => {
    const gates = lesse.overpass.elements.filter((element) => element.tags?.waterway === "lock_gate");
    expect(gates.length).toBeGreaterThan(0);
    expect(buildRouteNetwork(inputs()).network.paddleLinks).toHaveLength(1);
  });

  it("lists the rocks, drossage and low bridges on a link in the order it meets them", () => {
    const { network } = buildRouteNetwork(
      inputs({
        obstacles: [
          { id: "obstacle-2", kind: "low-bridge", position: record.line[25] },
          { id: "obstacle-1", kind: "rocks", position: record.line[8] },
          { id: "obstacle-3", kind: "drossage", position: [4.95, 50.25] },
        ],
      }),
    );
    expect(network.paddleLinks[0].obstacles).toEqual(["obstacle-1", "obstacle-2"]);
  });
});

describe("waters that run into each other", () => {
  const upper = { id: "walloon-up", river: "Lesse", line: record.line.slice(0, 17) };
  const lower = { id: "walloon-down", river: "Lesse", line: record.line.slice(16) };
  const split = (aires: NetworkInputs["aires"]) =>
    buildRouteNetwork(
      inputs({ records: [lower, upper], osm: { "walloon-up": lesse.overpass, "walloon-down": lesse.overpass }, aires }),
    ).network;

  it("links across the join between two records, listing both", () => {
    const network = split(inputs().aires);
    expect(network.paddleLinks).toHaveLength(1);
    expect(network.paddleLinks[0]).toMatchObject({
      from: "official-aire-1",
      to: "official-aire-2",
      records: ["walloon-up", "walloon-down"],
    });
    const whole = buildRouteNetwork(inputs()).network.paddleLinks[0];
    expect(Math.abs(network.paddleLinks[0].distanceM - whole.distanceM)).toBeLessThan(5);
  });

  it("places aires just above the join on the upper record only, in their order along the water", () => {
    const [[lng0, lat0], [lng1, lat1]] = [record.line[15], record.line[16]];
    const towardJoin = (share: number): Position => [lng0 + (lng1 - lng0) * share, lat0 + (lat1 - lat0) * share];
    const network = split([
      ...inputs().aires,
      { id: "official-aire-3", use: "both", position: towardJoin(0.5) },
      { id: "official-aire-4", use: "both", position: towardJoin(0.8) },
    ]);
    expect(pairs(network)).toEqual([
      ["official-aire-1", "official-aire-3"],
      ["official-aire-3", "official-aire-4"],
      ["official-aire-4", "official-aire-2"],
    ]);
    expect(network.paddleLinks.every((link) => link.distanceM > 0)).toBe(true);
  });

  it("links an aire at the join once each way", () => {
    const network = split([...inputs().aires, { id: "official-aire-3", use: "both", position: MIDWAY }]);
    expect(pairs(network)).toEqual([
      ["official-aire-1", "official-aire-3"],
      ["official-aire-3", "official-aire-2"],
    ]);
  });
});

describe("a link's line", () => {
  it("runs from the first node to the second, rounded to 5 decimals", () => {
    const [link] = buildRouteNetwork(inputs()).network.paddleLinks;
    const first = link.line[0];
    const last = link.line[link.line.length - 1];
    expect(Math.abs(first[1] - BELOW_WEIR[1])).toBeLessThan(0.001);
    expect(Math.abs(last[1] - ABOVE_MEUSE[1])).toBeLessThan(0.001);
    for (const [lng, lat] of link.line) {
      expect(Math.round(lng * 1e5) / 1e5).toBe(lng);
      expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
    }
  });
});
