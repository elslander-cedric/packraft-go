// Seam 3: lock markers from a saved Overpass answer (no network). #57
import { describe, expect, it } from "vitest";
import { lockMarkers } from "./locks";
import type { OverpassResponse, Polygon } from "./osm";

const square = (west: number, south: number, east: number, north: number): Polygon[] => [
  [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
];

const regions = [
  { id: "brussels", area: square(4.2, 50.78, 4.5, 50.92) },
  { id: "flanders", area: square(3.0, 50.93, 5.0, 51.4) },
];

const way = (id: number, tags: Record<string, string>, lng: number, lat: number) => ({
  type: "way" as const,
  id,
  tags,
  // A chamber about 70 m long.
  geometry: [
    { lat, lon: lng },
    { lat, lon: lng + 0.001 },
  ],
});

const answer: OverpassResponse = {
  elements: [
    way(1, { lock: "yes", waterway: "canal", lock_name: "Écluse d'Anderlecht - Sluis van Anderlecht" }, 4.3012, 50.8195),
    way(2, { lock: "yes", waterway: "canal", lock_name: "Sluis Lembeek", name: "Kanaal" }, 4.2, 50.95),
    // A second chamber of the same lock, a few metres away: one marker.
    way(3, { lock: "yes", waterway: "canal", lock_name: "Sluis Lembeek" }, 4.2, 50.95005),
    // The mapped water of the lock, not a chamber.
    way(4, { lock: "yes", natural: "water", water: "lock" }, 4.3012, 50.8195),
    // Unnamed lock, named by its waterway.
    way(5, { lock: "yes", waterway: "river", name: "Dijle" }, 4.4, 50.95),
    // Outside both regions.
    way(6, { lock: "yes", waterway: "canal", lock_name: "Sluis Elsewhere" }, 6.0, 50.5),
  ],
};

describe("lock markers", () => {
  const markers = lockMarkers(answer, regions);

  it("makes one marker per lock, named from the lock name, then the waterway's name, brussels first", () => {
    expect(markers.map((m) => m.name)).toEqual(["Écluse d'Anderlecht - Sluis van Anderlecht", "Dijle", "Sluis Lembeek"]);
  });

  it("puts the marker in the middle of the lock and tells which region it is in", () => {
    const anderlecht = markers[0];
    expect(anderlecht.region).toBe("brussels");
    expect(anderlecht.position[0]).toBeCloseTo(4.3017, 4);
    expect(anderlecht.position[1]).toBeCloseTo(50.8195, 4);
    expect(markers[2].region).toBe("flanders");
  });

  it("has a stable id from the OpenStreetMap way", () => {
    expect(markers[0].id).toBe("lock-way-1");
  });
});
