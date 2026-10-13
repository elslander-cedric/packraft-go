// Offline preparation of access rule geometry from OpenStreetMap (ADR 0024).
// Turns Overpass API answers (`out geom`) into simplified lines and areas.
// Used by scripts/prepare-access-data.mts only; never at runtime.
import { insidePolygon, type Position } from "@/core/geo";
import type { LatLng } from "@/core/trip";

type OverpassPoint = { lat: number; lon: number } | null;
type OverpassWay = { type: "way"; id: number; tags?: Record<string, string>; geometry?: OverpassPoint[] };
type OverpassMember = { type: string; ref: number; role: string; geometry?: OverpassPoint[] };
type OverpassRelation = { type: "relation"; id: number; tags?: Record<string, string>; members?: OverpassMember[] };
type OverpassNode = { type: "node"; id: number; tags?: Record<string, string> };
export type OverpassElement = OverpassWay | OverpassRelation | OverpassNode;
export type OverpassResponse = { elements: OverpassElement[] };

export type Line = Position[];
/** An outer ring followed by its holes. */
export type Polygon = Line[];

const toLine = (geometry: OverpassPoint[] | undefined): Line =>
  (geometry ?? []).filter((p): p is { lat: number; lon: number } => p !== null).map((p) => [p.lon, p.lat] as const);

/**
 * Every way's line in the answer, from ways and from relation members, each
 * way once. `include` picks ways by their tags (relation members have none in
 * Overpass answers, so they are always included).
 */
export function waysOf(response: OverpassResponse, include: (tags: Record<string, string>) => boolean = () => true): Line[] {
  const seen = new Set<number>();
  const lines: Line[] = [];
  for (const element of response.elements) {
    if (element.type === "way" && include(element.tags ?? {}) && !seen.has(element.id)) {
      seen.add(element.id);
      lines.push(toLine(element.geometry));
    }
    if (element.type === "relation") {
      for (const member of element.members ?? []) {
        if (member.type !== "way" || seen.has(member.ref)) continue;
        seen.add(member.ref);
        lines.push(toLine(member.geometry));
      }
    }
  }
  return lines.filter((line) => line.length >= 2);
}

const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Joins lines that share end points into as few, longer lines as possible. */
export function mergeLines(lines: readonly Line[]): Line[] {
  const pool = lines.map((line) => [...line]);
  const merged: Line[] = [];
  while (pool.length > 0) {
    let current = pool.pop()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const other = pool[i];
        const [first, last] = [current[0], current[current.length - 1]];
        let joined: Line | null = null;
        if (same(last, other[0])) joined = [...current, ...other.slice(1)];
        else if (same(last, other[other.length - 1])) joined = [...current, ...other.slice(0, -1).reverse()];
        else if (same(first, other[other.length - 1])) joined = [...other, ...current.slice(1)];
        else if (same(first, other[0])) joined = [...other.slice(1).reverse(), ...current];
        if (joined) {
          current = joined;
          pool.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    merged.push(current);
  }
  return merged;
}

/** Joins ways into closed rings; pieces that don't close are dropped. */
export function assembleRings(lines: readonly Line[]): Line[] {
  return mergeLines(lines).filter((ring) => ring.length >= 4 && same(ring[0], ring[ring.length - 1]));
}

const asLatLng = ([lng, lat]: Position): LatLng => ({ lat, lng });

/** Groups outer rings with the inner rings (holes) that lie inside them. */
function polygonsFrom(outers: readonly Line[], inners: readonly Line[]): Polygon[] {
  const polygons: Polygon[] = outers.map((outer) => [outer]);
  for (const inner of inners) {
    const owner = polygons.find((polygon) => insidePolygon(asLatLng(inner[0]), [polygon[0]]));
    owner?.push(inner);
  }
  return polygons;
}

/** The area of a boundary or multipolygon relation, as polygons with holes. */
export function relationArea(response: OverpassResponse, relationId: number): Polygon[] {
  const relation = response.elements.find(
    (e): e is OverpassRelation => e.type === "relation" && e.id === relationId,
  );
  if (!relation) throw new Error(`relation ${relationId} is not in the Overpass answer`);
  const ways = (role: string) =>
    (relation.members ?? [])
      .filter((m) => m.type === "way" && m.role === role)
      .map((m) => toLine(m.geometry))
      .filter((line) => line.length >= 2);
  // Members without a role count as outer, as in OSM's multipolygon rules.
  return polygonsFrom(assembleRings([...ways("outer"), ...ways("")]), assembleRings(ways("inner")));
}

/** Areas drawn as closed ways or multipolygon relations, e.g. docks. `include` picks them by tags. */
export function areasOf(response: OverpassResponse, include: (tags: Record<string, string>) => boolean): Polygon[] {
  const polygons: Polygon[] = [];
  for (const element of response.elements) {
    if (!include(element.tags ?? {})) continue;
    if (element.type === "way") {
      const ring = toLine(element.geometry);
      if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) polygons.push([ring]);
    } else if (element.type === "relation") {
      polygons.push(...relationArea(response, element.id));
    }
  }
  return polygons;
}

const RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

/** Distance in metres from p to the segment a–b, on a local flat approximation. */
function offsetM(p: Position, a: Position, b: Position): number {
  const k = Math.cos(p[1] * RAD) * RAD * EARTH_RADIUS_M;
  const m = RAD * EARTH_RADIUS_M;
  const [ax, ay, bx, by, px, py] = [a[0] * k, a[1] * m, b[0] * k, b[1] * m, p[0] * k, p[1] * m];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas–Peucker: drops vertices that are less than `toleranceM` off the simplified line. Keeps both ends. */
export function simplifyLine(line: readonly Position[], toleranceM: number): Line {
  if (line.length <= 2) return [...line];
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let worst = -1;
    let worstOffset = 0;
    for (let i = start + 1; i < end; i++) {
      const offset = offsetM(line[i], line[start], line[end]);
      if (offset > worstOffset) [worst, worstOffset] = [i, offset];
    }
    if (worst >= 0 && worstOffset > toleranceM) {
      keep[worst] = true;
      stack.push([start, worst], [worst, end]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Simplifies every ring of a polygon; rings that collapse are dropped (an outer ring that collapses drops the polygon). */
export function simplifyPolygon(polygon: Polygon, toleranceM: number): Polygon | null {
  const rings = polygon.map((ring) => simplifyLine(ring, toleranceM));
  if (rings[0].length < 4) return null;
  return [rings[0], ...rings.slice(1).filter((ring) => ring.length >= 4)];
}

/** The parts of a line whose vertices satisfy `keep`, as separate lines of at least two vertices. */
export function clipLine(line: readonly Position[], keep: (p: Position) => boolean): Line[] {
  const parts: Line[] = [];
  let current: Line = [];
  for (const p of line) {
    if (keep(p)) current.push(p);
    else {
      if (current.length >= 2) parts.push(current);
      current = [];
    }
  }
  if (current.length >= 2) parts.push(current);
  return parts;
}

/** True when the position is inside any of the polygons. */
export function insideAny(polygons: readonly Polygon[]): (p: Position) => boolean {
  return (p) => polygons.some((polygon) => insidePolygon(asLatLng(p), polygon));
}

const nearestIndex = (line: readonly Position[], to: Position) => {
  let best = 0;
  for (let i = 1; i < line.length; i++) {
    if (Math.hypot(line[i][0] - to[0], line[i][1] - to[1]) < Math.hypot(line[best][0] - to[0], line[best][1] - to[1])) {
      best = i;
    }
  }
  return best;
};

/** The part of a line between the vertices nearest to `from` and `to`. */
export function cutBetween(line: readonly Position[], from: Position, to: Position): Line {
  const [a, b] = [nearestIndex(line, from), nearestIndex(line, to)].sort((x, y) => x - y);
  return line.slice(a, b + 1);
}

/** Rounds to 5 decimals (about a metre), which keeps the shipped files small. */
export const roundPosition = ([lng, lat]: Position): Position => [
  Math.round(lng * 1e5) / 1e5,
  Math.round(lat * 1e5) / 1e5,
];
