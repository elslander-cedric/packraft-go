// Walking links (ADR 0039), built from recorded BRouter answers, never the live server.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RouteNode } from "@/core/routeNetwork";
import { walkingLink, walkingPairs, walkingUrl } from "./walking";

const recorded = (name: string) =>
  readFileSync(
    path.join(__dirname, "..", "..", "routing", "fixtures", name),
    "utf8",
  );

const node = (id: string, position: [number, number]): RouteNode => ({
  id,
  kind: "official-aire",
  use: "both",
  position,
});

// The points of the recorded trail-preferring hike, Comblain-au-Pont to Comblain-la-Tour.
const comblainAuPont = node("official-aire-1", [5.577, 50.4745]);
const comblainLaTour = node("official-aire-2", [5.566, 50.456]);
const pair = { from: comblainAuPont, to: comblainLaTour };

describe("a walking link from a BRouter answer", () => {
  const link = walkingLink(pair, {
    status: 200,
    body: recorded("hiking-trail-preference.geojson"),
  });

  it("joins the two nodes with the walk's distance, climb and descent", () => {
    // 3919 m; filtered ascend 16 m, from 101.75 m up to 106 m, so 11.75 m down.
    expect(link).toMatchObject({
      from: "official-aire-1",
      to: "official-aire-2",
      distanceM: 3919,
      climbM: 16,
      descentM: 12,
    });
  });

  it("carries the walk's share on waymarked trails and on roads", () => {
    expect(link?.trailShare).toBeCloseTo(0.93, 2);
    expect(link?.roadShare).toBeCloseTo(0.3, 2);
  });

  it("draws the walk with fewer, rounded points from end to end", () => {
    const line = link?.line ?? [];
    expect(line.length).toBeGreaterThan(2);
    expect(line.length).toBeLessThan(132 / 2);
    expect(line[0]).toEqual([5.5773, 50.47465]);
    expect(line.at(-1)).toEqual([5.56577, 50.456]);
    for (const [lng, lat] of line) {
      expect(Math.round(lng * 1e5) / 1e5).toBe(lng);
      expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
    }
  });

  it("is none when the walk is longer than a walking link may be", () => {
    // Recorded for official aires 16 and 100 on the Semois: a 15 007 m walk.
    const body = readFileSync(
      path.join(__dirname, "fixtures", "walk-over-ceiling.geojson"),
      "utf8",
    );
    const far = {
      from: node("official-aire-16", [5.20387, 49.80789]),
      to: node("official-aire-100", [5.25834, 49.72318]),
    };
    expect(walkingLink(far, { status: 200, body })).toBeUndefined();
  });

  it("is none when BRouter finds no route", () => {
    expect(
      walkingLink(pair, {
        status: 400,
        body: recorded("hiking-no-route-400.txt"),
      }),
    ).toBeUndefined();
    expect(
      walkingLink(pair, {
        status: 200,
        body: recorded("hiking-no-route-single-point.geojson"),
      }),
    ).toBeUndefined();
  });
});

describe("the pairs of nodes to walk between", () => {
  const nodes = [
    node("official-aire-10", [5.0, 50.0]),
    node("official-aire-2", [5.1, 50.0]), // about 7 km east of aire 10
    node("official-aire-3", [5.3, 50.0]), // about 21 km east of aire 10, 14 km of aire 2
  ];

  it("pairs each two nodes no further apart as the crow flies than a walking link may be long, once", () => {
    const pairs = walkingPairs(nodes).map(
      ({ from, to }) => `${from.id} - ${to.id}`,
    );
    expect(pairs).toEqual([
      "official-aire-2 - official-aire-3",
      "official-aire-2 - official-aire-10",
    ]);
  });

  it("asks BRouter for a trail-preferring hike from one node to the other", () => {
    expect(walkingUrl(pair)).toBe(
      "https://brouter.de/brouter?lonlats=5.577,50.4745|5.566,50.456&profile=hiking-mountain&alternativeidx=0&format=geojson&profile:hiking_routes_preference=1",
    );
  });
});
