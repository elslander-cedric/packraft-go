// The Overpass queries for the route network (ADR 0039). For one Walloon stretch record: the
// waterways along it, for their direction, and the dams and lock gates on it, a plain box
// query on indexed tags, filtered by distance to the record's line afterwards. Outside
// Wallonia: the rivers, canals and paths near them, tile by tile, for bank spots.
import { boundsOf, insideArea, linesOf, type Bounds, type Geometry, type Position } from "@/core/geo";

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

/** The paths and roads that may reach a bank: not motorways, not private, not on a bridge or in a tunnel. */
const BANK_HIGHWAYS =
  "^(path|footway|track|cycleway|bridleway|pedestrian|living_street|residential|unclassified|service|tertiary)$";
/** How far from a waterway's line a path or road node is asked for: the widest bank distance (`bankSpots.ts`). */
export const BANK_QUERY_M = 60;

/**
 * The Overpass query for bank spots in one tile (ADR 0039): the rivers and canals, the dams,
 * lock gates and weirs on them, and the nodes of paths and roads near them.
 */
export function bankSpotQuery([west, south, east, north]: Bounds): string {
  return [
    `[out:json][timeout:180][bbox:${round(south)},${round(west)},${round(north)},${round(east)}];`,
    `way["waterway"~"^(river|canal)$"]->.water;`,
    `.water out geom;`,
    `nw["waterway"~"^(dam|lock_gate|weir)$"];`,
    `out geom;`,
    `way(around.water:${BANK_QUERY_M})["highway"~"${BANK_HIGHWAYS}"][!"bridge"][!"tunnel"]["access"!~"^(private|no)$"]->.roads;`,
    `node(w.roads)(around.water:${BANK_QUERY_M});`,
    `out skel qt;`,
  ].join("\n");
}

/** A bank spot query's tile, in degrees: small enough for Overpass to answer in time. */
const TILE_DEG = { lng: 0.25, lat: 0.2 } as const;

/** The tiles that cover the regions where bank spots may be (Flanders and Brussels). */
export function bankSpotTiles(regions: readonly Geometry[]): Bounds[] {
  const all = regions.map(boundsOf);
  const west = Math.floor(Math.min(...all.map((bounds) => bounds[0])) / TILE_DEG.lng) * TILE_DEG.lng;
  const south = Math.floor(Math.min(...all.map((bounds) => bounds[1])) / TILE_DEG.lat) * TILE_DEG.lat;
  const east = Math.max(...all.map((bounds) => bounds[2]));
  const north = Math.max(...all.map((bounds) => bounds[3]));
  const vertices = regions.flatMap((region) => linesOf(region).flat());
  const tiles: Bounds[] = [];
  for (let i = 0; west + i * TILE_DEG.lng < east; i++) {
    for (let j = 0; south + j * TILE_DEG.lat < north; j++) {
      const [tileWest, tileSouth] = [west + i * TILE_DEG.lng, south + j * TILE_DEG.lat];
      const tile: Bounds = [round(tileWest), round(tileSouth), round(tileWest + TILE_DEG.lng), round(tileSouth + TILE_DEG.lat)];
      const centre = { lng: tileWest + TILE_DEG.lng / 2, lat: tileSouth + TILE_DEG.lat / 2 };
      const inTile = ([lng, lat]: Position) => lng >= tile[0] && lng <= tile[2] && lat >= tile[1] && lat <= tile[3];
      if (regions.some((region) => insideArea(centre, region)) || vertices.some(inTile)) tiles.push(tile);
    }
  }
  return tiles;
}
