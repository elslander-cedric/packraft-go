import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { wayShares } from "./wayShares";

const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8"));

const HEADER = ["Longitude", "Latitude", "Elevation", "Distance", "CostPerKm", "WayTags", "NodeTags"];
const row = (distance: number, wayTags: string) => [
  "5000000",
  "50000000",
  "100",
  String(distance),
  "1000",
  wayTags,
  "",
];
const track = (messages: unknown) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { messages },
      geometry: { type: "LineString", coordinates: [] },
    },
  ],
});

describe("trail and road share of a BRouter walk", () => {
  it("counts distance on hiking route ways as trail and on road classes as road", () => {
    const shares = wayShares(
      track([
        HEADER,
        row(600, "highway=path route_hiking_lwn=yes"),
        row(200, "highway=residential route_hiking_rwn=yes"),
        row(150, "highway=tertiary"),
        row(50, "highway=track"),
      ]),
    );
    expect(shares).toEqual({ lengthM: 1000, trailShare: 0.8, roadShare: 0.35 });
  });

  it("reads the shares of a recorded trail-preferring walk", () => {
    const shares = wayShares(fixture("hiking-trail-preference.geojson"));
    expect(shares?.lengthM).toBe(3919);
    expect(shares?.trailShare).toBeCloseTo(0.93, 2);
    expect(shares?.roadShare).toBeCloseTo(0.3, 2);
  });

  it("gives nothing when the messages no longer carry distances and way tags", () => {
    expect(
      wayShares(
        track([
          ["Longitude", "Latitude"],
          ["5000000", "50000000"],
        ]),
      ),
    ).toBeNull();
    expect(wayShares(track(undefined))).toBeNull();
    expect(wayShares("not a track")).toBeNull();
  });

  it("gives nothing for a walk of no length", () => {
    expect(wayShares(track([HEADER]))).toBeNull();
  });
});
