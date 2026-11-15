// The Overpass query for one Walloon stretch record (ADR 0039): the waterways along it,
// for their direction, and the dams and lock gates on it. A plain box query on indexed
// tags; everything is filtered by distance to the record's line afterwards.
import type { Position } from "@/core/geo";

/** How far around the record's line the box reaches, in degrees (about 300 m). */
const MARGIN_DEG = 0.003;

const round = (value: number) => Math.round(value * 1e5) / 1e5;

export function recordQuery(line: readonly Position[]): string {
  const south = round(Math.min(...line.map(([, lat]) => lat)) - MARGIN_DEG);
  const north = round(Math.max(...line.map(([, lat]) => lat)) + MARGIN_DEG);
  const west = round(Math.min(...line.map(([lng]) => lng)) - MARGIN_DEG);
  const east = round(Math.max(...line.map(([lng]) => lng)) + MARGIN_DEG);
  return [
    `[out:json][timeout:180][bbox:${south},${west},${north},${east}];`,
    `(`,
    `  way["waterway"~"^(river|stream|canal)$"];`,
    `  nw["waterway"~"^(dam|lock_gate)$"];`,
    `);`,
    `out geom;`,
  ].join("\n");
}
