// The Overpass queries for the route network (ADR 0039). For one Walloon stretch record: the
// waterways along it, for their direction, and the dams and lock gates on it, a plain box
// query on indexed tags, filtered by distance to the record's line afterwards. Outside
// Wallonia: the rivers, canals and paths near them, tile by tile, for bank spots.
import { boundsOf, insideArea, linesOf, type Bounds, type Geometry, type Position } from "@/core/geo";
import { distanceM, lengthM, pointAt, simplify, type Pt } from "../walloonStretches/geo";
import type { OverpassResult } from "../walloonStretches/overpass";

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
/** Simplification of the waters' lines the paths are asked around, in metres: well inside the bank distance. */
const PATH_LINE_TOLERANCE_M = 10;
/** How far outside its tile a water's line is kept, in degrees (about 200 m), so paths at the edge count. */
const TILE_MARGIN_DEG = 0.002;

const header = ([west, south, east, north]: Bounds) =>
  `[out:json][timeout:180][bbox:${round(south)},${round(west)},${round(north)},${round(east)}];`;

/** The first of a tile's two bank spot queries (ADR 0039): its rivers and canals, and the dams, lock gates and weirs. */
export function bankWaterQuery(tile: Bounds): string {
  return [header(tile), `way["waterway"~"^(river|canal)$"];`, `out geom;`, `nw["waterway"~"^(dam|lock_gate|weir)$"];`, `out geom;`].join(
    "\n",
  );
}

/**
 * The named rivers' and canals' lines in the answer to `bankWaterQuery`, cut to the tile (and the
 * first point beyond it) and simplified: what the paths are asked around.
 */
export function bankWaterLines(answer: OverpassResult, [west, south, east, north]: Bounds): Position[][] {
  const inTile = ({ lat, lng }: Pt) =>
    lng >= west - TILE_MARGIN_DEG && lng <= east + TILE_MARGIN_DEG && lat >= south - TILE_MARGIN_DEG && lat <= north + TILE_MARGIN_DEG;
  return answer.elements
    .filter((element) => element.type === "way" && ["river", "canal"].includes(element.tags?.waterway ?? "") && element.tags?.name)
    .flatMap((way) => {
      const points = (way.geometry ?? []).flatMap((point) => (point ? [{ lat: point.lat, lng: point.lon }] : []));
      const kept = points.map((point, i) => inTile(point) || inTile(points[i - 1] ?? point) || inTile(points[i + 1] ?? point));
      const runs: Pt[][] = [];
      points.forEach((point, i) => {
        if (!kept[i]) return;
        if (i === 0 || !kept[i - 1]) runs.push([]);
        runs[runs.length - 1].push(point);
      });
      return runs
        .filter((run) => run.length >= 2)
        .map((run) => simplify(run, PATH_LINE_TOLERANCE_M).map(({ lng, lat }): Position => [round(lng), round(lat)]));
    });
}

/** The points along the waters the paths are asked around, this far apart, in metres. */
const PATH_POINT_SPACING_M = 350;
/**
 * How far around each point, in metres: between two points it still reaches past the widest
 * bank distance (sqrt(250² − 175²) ≈ 180 m). The nodes are measured against the water afterwards.
 */
export const PATH_POINT_RADIUS_M = 250;

/** Points along the lines, no further apart than the spacing, none close to one already taken. */
export function bankPathPoints(lines: readonly (readonly Position[])[]): Position[] {
  const points: Pt[] = [];
  const add = (point: Pt) => {
    if (!points.some((other) => distanceM(other, point) < PATH_POINT_SPACING_M / 2)) points.push(point);
  };
  for (const line of lines) {
    const pts = line.map(([lng, lat]) => ({ lat, lng }));
    const length = lengthM(pts);
    const steps = Math.max(1, Math.ceil(length / PATH_POINT_SPACING_M));
    for (let i = 0; i <= steps; i++) add(pointAt(pts, (length * i) / steps));
  }
  return points.map(({ lng, lat }): Position => [round(lng), round(lat)]);
}

/**
 * The second of a tile's two bank spot queries: the nodes of paths and roads near the waters,
 * around points along their lines. Not around the lines themselves: the public server (0.7.62)
 * silently answered nothing around a line or a set of ways in many tiles, but answers around a point.
 */
export function bankPathQuery(tile: Bounds, lines: readonly (readonly Position[])[]): string {
  const around = bankPathPoints(lines).map(([lng, lat]) => `around:${PATH_POINT_RADIUS_M},${lat},${lng}`);
  return [
    header(tile),
    `(`,
    ...around.map((filter) => `way(${filter})["highway"~"${BANK_HIGHWAYS}"][!"bridge"][!"tunnel"]["access"!~"^(private|no)$"];`),
    `)->.roads;`,
    `(`,
    ...around.map((filter) => `node(w.roads)(${filter});`),
    `);`,
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
