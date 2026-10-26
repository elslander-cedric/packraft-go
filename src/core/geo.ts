// Small geometry helpers for access rules: GeoJSON-style shapes in [lng, lat]
// order, distances in metres on a local flat approximation (good to well under
// 1% over the few kilometres that matter here).
import type { LatLng } from "./trip";

/** A position in GeoJSON order: longitude, latitude. */
export type Position = readonly [lng: number, lat: number];
type Ring = readonly Position[];

export type LineGeometry =
  | { readonly type: "LineString"; readonly coordinates: readonly Position[] }
  | { readonly type: "MultiLineString"; readonly coordinates: readonly (readonly Position[])[] };
export type AreaGeometry =
  | { readonly type: "Polygon"; readonly coordinates: readonly Ring[] }
  | { readonly type: "MultiPolygon"; readonly coordinates: readonly (readonly Ring[])[] };
export type Geometry = LineGeometry | AreaGeometry;

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Metres east and north of `origin`. */
function toLocal(origin: LatLng, [lng, lat]: Position): [x: number, y: number] {
  return [
    (lng - origin.lng) * RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD),
    (lat - origin.lat) * RAD * EARTH_RADIUS_M,
  ];
}

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance in metres from `point` to the segment a–b. */
function distanceToSegmentM(point: LatLng, a: Position, b: Position): number {
  const [ax, ay] = toLocal(point, a);
  const [bx, by] = toLocal(point, b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * The point on a polyline (at least one point) nearest to `point`, on a local
 * flat approximation around `point`.
 */
export function nearestOnLine(point: LatLng, line: readonly LatLng[]): LatLng {
  let best: LatLng = { lat: line[0].lat, lng: line[0].lng };
  let bestM = distanceM(point, best);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const [ax, ay] = toLocal(point, [a.lng, a.lat]);
    const [bx, by] = toLocal(point, [b.lng, b.lat]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    const m = Math.hypot(ax + t * dx, ay + t * dy);
    if (m < bestM) {
      bestM = m;
      best = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    }
  }
  return best;
}

/** Distance in metres from `point` to a line; Infinity for an empty line. */
export function distanceToLineM(point: LatLng, line: readonly Position[]): number {
  if (line.length === 1) return distanceM(point, { lat: line[0][1], lng: line[0][0] });
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distanceToSegmentM(point, line[i - 1], line[i]));
  return best;
}

/** True when `point` is inside the ring (even-odd rule). */
function insideRing(point: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when `point` is inside the polygon: in its outer ring and not in a hole. */
export function insidePolygon(point: LatLng, polygon: readonly Ring[]): boolean {
  return polygon.length > 0 && insideRing(point, polygon[0]) && !polygon.slice(1).some((hole) => insideRing(point, hole));
}

/** True when `point` is inside an area geometry; always false for lines. */
export function insideArea(point: LatLng, geometry: Geometry): boolean {
  if (geometry.type === "Polygon") return insidePolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((p) => insidePolygon(point, p));
  return false;
}

/** The lines of a line geometry, or the rings of an area. */
export function linesOf(geometry: Geometry): readonly (readonly Position[])[] {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.flat();
}

/**
 * True when `point` touches the geometry: inside an area, or within
 * `withinM` metres of a line or an area's edge.
 */
export function touches(point: LatLng, geometry: Geometry, withinM: number): boolean {
  if (insideArea(point, geometry)) return true;
  return linesOf(geometry).some((line) => distanceToLineM(point, line) <= withinM);
}

/** [west, south, east, north] of a geometry. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];

export function boundsOf(geometry: Geometry): Bounds {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of linesOf(geometry))
    for (const [lng, lat] of line) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  return [w, s, e, n];
}

/** True when `point` is within `marginM` metres of the bounds (a cheap first check). */
export function nearBounds(point: LatLng, [w, s, e, n]: Bounds, marginM: number): boolean {
  const dLat = marginM / (RAD * EARTH_RADIUS_M);
  const dLng = dLat / Math.max(0.01, Math.cos(point.lat * RAD));
  return point.lat >= s - dLat && point.lat <= n + dLat && point.lng >= w - dLng && point.lng <= e + dLng;
}

/**
 * Points along a line, no more than `stepM` metres apart, including every
 * vertex: used to check a whole leg against the rules.
 */
export function samplesAlong(line: readonly LatLng[], stepM: number): LatLng[] {
  if (line.length === 0) return [];
  const samples: LatLng[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const steps = Math.ceil(distanceM(a, b) / stepM);
    for (let k = 1; k <= steps; k++) {
      samples.push({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lng: a.lng + ((b.lng - a.lng) * k) / steps });
    }
    if (steps === 0) samples.push(b);
  }
  return samples;
}
