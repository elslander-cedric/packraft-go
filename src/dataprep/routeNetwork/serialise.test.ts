import { describe, expect, it } from "vitest";
import type { RouteNetwork } from "@/core/routeNetwork";
import { serialiseRouteNetwork } from "./serialise";

const network: RouteNetwork = {
  format: "packraft-go/route-network",
  version: 1,
  title: "Route network",
  attribution: "OSM",
  sources: [{ title: "Aires", url: "https://example.org/aires" }],
  snapshot: "2026-11-15",
  nodes: [
    { id: "official-aire-1", kind: "official-aire", use: "put-in", position: [4.9, 50.2] },
    { id: "official-aire-2", kind: "official-aire", use: "take-out", position: [4.91, 50.21] },
  ],
  paddleLinks: [
    {
      from: "official-aire-1",
      to: "official-aire-2",
      direction: "downstream",
      distanceM: 1500,
      waters: ["Lesse"],
      records: ["walloon-1A2"],
      obstacles: [],
      line: [
        [4.9, 50.2],
        [4.91, 50.21],
      ],
    },
  ],
  walkingLinks: [
    {
      from: "official-aire-1",
      to: "official-aire-2",
      distanceM: 1700,
      climbM: 40,
      descentM: 38,
      trailShare: 0.8,
      roadShare: 0.1,
      line: [
        [4.9, 50.2],
        [4.905, 50.207],
        [4.91, 50.21],
      ],
    },
  ],
};

describe("serialiseRouteNetwork", () => {
  it("writes one node and one link per line, so a refresh reads well as a diff", () => {
    const text = serialiseRouteNetwork(network);
    const lines = text.split("\n");
    expect(lines).toContain(`    ${JSON.stringify(network.nodes[0])},`);
    expect(lines).toContain(`    ${JSON.stringify(network.nodes[1])}`);
    expect(lines).toContain(`    ${JSON.stringify(network.paddleLinks[0])}`);
    expect(lines).toContain(`    ${JSON.stringify(network.walkingLinks?.[0])}`);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("reads back as the same network, with its format, version, sources and snapshot", () => {
    expect(JSON.parse(serialiseRouteNetwork(network))).toEqual(network);
  });
});
