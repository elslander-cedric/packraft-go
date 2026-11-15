// Checks on the built-in route network (ADR 0039): every node and paddle link is usable as
// it ships, whatever a refresh brought in.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { distanceM, projectOntoLine } from "@/core/geo";
import { PASSING_TOLERANCE_M } from "@/core/locks";
import {
  paddleDirections,
  ROUTE_NETWORK_FORMAT,
  routeNodeKinds,
  type PaddleLink,
  type WalkingLink,
} from "@/core/routeNetwork";
import { defaultSettings } from "@/core/settings";
import { suggestTrips } from "@/core/suggestedTrips";
import { loadRouteNetwork } from "@/ui/routeNetwork";
import { builtInAccessRules, builtInLocks, builtInObstacles, builtInOfficialAires } from "./builtInRules";
import { builtInRouteNetwork as network } from "./builtInRouteNetwork";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nodeIds = new Set(network.nodes.map((node) => node.id));
const recordIds = new Set(builtInAccessRules.records.map((record) => record.id));
const airesById = new Map(builtInOfficialAires.map((aire) => [aire.id, aire]));
const linkName = (link: PaddleLink | WalkingLink) => `${link.from} -> ${link.to}`;
const walkingLinks = network.walkingLinks ?? [];
/** The longest walking link (ADR 0039: about 15 km). */
const WALKING_CEILING_M = 15_000;

/** Belgium and a little around it. */
const inBelgium = ([lng, lat]: readonly [number, number]) => lng > 2.4 && lng < 6.5 && lat > 49.4 && lat < 51.6;

describe("the built-in route network", () => {
  it("records its format version, sources and snapshot date", () => {
    expect(network.format).toBe(ROUTE_NETWORK_FORMAT);
    expect(network.version).toBe(1);
    expect(network.snapshot).toMatch(DATE);
    expect(network.sources.length).toBeGreaterThan(0);
    for (const source of network.sources) {
      expect(source.title).not.toBe("");
      expect(source.url).toMatch(/^https:\/\//);
    }
  });

  it("has every official aire as a node, once, with a known kind, its use and its position", () => {
    expect(nodeIds.size).toBe(network.nodes.length);
    expect(network.nodes.filter((node) => node.kind === "official-aire")).toHaveLength(builtInOfficialAires.length);
    for (const node of network.nodes) {
      expect(routeNodeKinds, node.id).toContain(node.kind);
      expect(inBelgium(node.position), node.id).toBe(true);
      const aire = airesById.get(node.id);
      expect(aire, node.id).toBeDefined();
      expect([node.use, node.position], node.id).toEqual([aire?.use, aire?.position]);
    }
  });

  it("gives every paddle link known nodes, a direction, a distance and its access records", () => {
    expect(network.paddleLinks.length).toBeGreaterThan(0);
    for (const link of network.paddleLinks) {
      expect(nodeIds.has(link.from) && nodeIds.has(link.to), linkName(link)).toBe(true);
      expect(link.from, linkName(link)).not.toBe(link.to);
      expect(paddleDirections, linkName(link)).toContain(link.direction);
      expect(link.distanceM, linkName(link)).toBeGreaterThan(0);
      expect(link.records.length, linkName(link)).toBeGreaterThan(0);
      for (const record of link.records) expect(recordIds.has(record), `${linkName(link)}: ${record}`).toBe(true);
      expect(link.line.length, linkName(link)).toBeGreaterThanOrEqual(2);
      expect(link.line.every(inBelgium), linkName(link)).toBe(true);
    }
  });

  it("has no paddle link that passes a dam, an impassable obstacle or a lock", () => {
    const barriers = [
      ...builtInObstacles.filter((obstacle) => obstacle.kind === "dam" || obstacle.kind === "impassable"),
      ...builtInLocks.locks,
    ];
    const passing = network.paddleLinks.flatMap((link) => {
      const line = link.line.map(([lng, lat]) => ({ lat, lng }));
      const lengthM = line.slice(1).reduce((sum, point, i) => sum + distanceM(line[i], point), 0);
      return barriers.flatMap((barrier) => {
        const { offM, alongM } = projectOntoLine({ lat: barrier.position[1], lng: barrier.position[0] }, line);
        // Beyond either end of the line, a barrier is before the put-in or after the take-out.
        const between = alongM > 1 && alongM < lengthM - 1;
        return offM <= PASSING_TOLERANCE_M && between ? [`${linkName(link)}: ${barrier.id}`] : [];
      });
    });
    expect(passing).toEqual([]);
  });

  it("lists only known obstacles on its links", () => {
    const obstacleIds = new Set(builtInObstacles.map((obstacle) => obstacle.id));
    for (const link of network.paddleLinks) {
      for (const obstacle of link.obstacles) expect(obstacleIds.has(obstacle), `${linkName(link)}: ${obstacle}`).toBe(true);
    }
  });

  it("links each pair of nodes at most once each way", () => {
    const pairs = network.paddleLinks.map(linkName);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("has no walking link over the ceiling", () => {
    const over = walkingLinks.filter((link) => link.distanceM > WALKING_CEILING_M).map(linkName);
    expect(over).toEqual([]);
  });

  it("gives every walking link known nodes, distance, climb, descent, trail and road shares, and a line", () => {
    expect(walkingLinks.length).toBeGreaterThan(0);
    for (const link of walkingLinks) {
      expect(nodeIds.has(link.from) && nodeIds.has(link.to), linkName(link)).toBe(true);
      expect(link.from, linkName(link)).not.toBe(link.to);
      expect(link.distanceM, linkName(link)).toBeGreaterThan(0);
      expect(link.climbM, linkName(link)).toBeGreaterThanOrEqual(0);
      expect(link.descentM, linkName(link)).toBeGreaterThanOrEqual(0);
      for (const share of [link.trailShare, link.roadShare]) {
        expect(share, linkName(link)).toBeGreaterThanOrEqual(0);
        expect(share, linkName(link)).toBeLessThanOrEqual(1);
      }
      expect(link.line.length, linkName(link)).toBeGreaterThanOrEqual(2);
      expect(link.line.every(inBelgium), linkName(link)).toBe(true);
    }
  });

  it("walks between each two nodes at most once, as walking links go either way", () => {
    const pairs = walkingLinks.map((link) => [link.from, link.to].sort().join(" - "));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("is searched for hike + paddle trips over all of Belgium in well under a second, even with many switches", () => {
    const started = performance.now();
    const result = suggestTrips({
      network,
      rules: builtInAccessRules,
      when: { date: "2027-07-10", today: "2026-11-15" },
      area: [2.4, 49.4, 6.5, 51.6],
      // No distance wished leaves only the one-day limit to bound the search.
      wishes: { maxSwitches: 10, shape: "either" },
      pace: defaultSettings,
    });
    expect(performance.now() - started).toBeLessThan(500);
    expect(result.status === "found" && result.trips.some((trip) => trip.hikeM > 0)).toBe(true);
  });
});

/** Every app source file (not tests, scripts or offline preparation). */
function appSources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) {
      return ["dataprep", "prepare", "testing"].includes(name) ? [] : appSources(file);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("loading the route network", () => {
  it("is lazy: no app module imports it statically, so it stays out of the initial bundle", () => {
    const root = path.join(__dirname, "..");
    // Type-only imports are erased from the bundle.
    const staticImport = /^\s*import\s+(?!type\s)[^;]*from\s+["'][^"']*(builtInRouteNetwork|route-network\.json)["']/m;
    const importers = appSources(root)
      .filter((file) => !file.endsWith(path.join("access", "builtInRouteNetwork.ts")))
      .filter((file) => staticImport.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(importers).toEqual([]);
  });

  it("loads the built-in network when asked", async () => {
    expect(await loadRouteNetwork()).toBe(network);
  });
});
