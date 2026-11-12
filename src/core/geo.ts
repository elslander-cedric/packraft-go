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
export function distanceM(pointA: LatLng, pointB: LatLng): number {
  const dLat = (pointB.lat - pointA.lat) * RAD;
  const dLng = (pointB.lng - pointA.lng) * RAD;
  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.cos(pointA.lat * RAD) * Math.cos(pointB.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Distance in metres from `point` to the segment a–b. */
function distanceToSegmentM(point: LatLng, positionA: Position, positionB: Position): number {
  const [ax, ay] = toLocal(point, positionA);
  const [bx, by] = toLocal(point, positionB);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const fraction = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  return Math.hypot(ax + fraction * dx, ay + fraction * dy);
}

/**
 * The point on a polyline (at least one point) nearest to `point`, on a local
 * flat approximation around `point`.
 */
export function nearestOnLine(point: LatLng, line: readonly LatLng[]): LatLng {
  let best: LatLng = { lat: line[0].lat, lng: line[0].lng };
  let bestM = distanceM(point, best);
  for (let i = 1; i < line.length; i++) {
    const pointA = line[i - 1];
    const pointB = line[i];
    const [ax, ay] = toLocal(point, [pointA.lng, pointA.lat]);
    const [bx, by] = toLocal(point, [pointB.lng, pointB.lat]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const fraction = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    const metres = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    if (metres < bestM) {
      bestM = metres;
      best = {
        lat: pointA.lat + fraction * (pointB.lat - pointA.lat),
        lng: pointA.lng + fraction * (pointB.lng - pointA.lng),
      };
    }
  }
  return best;
}

/**
 * Where `point` is nearest a polyline (at least one point), on a local flat
 * approximation around `point`: `offM`, its distance from the line, and
 * `alongM`, how far along the line from its first point that nearest spot is.
 */
export function projectOntoLine(point: LatLng, line: readonly LatLng[]): { offM: number; alongM: number } {
  let best = { offM: distanceM(point, line[0]), alongM: 0 };
  let startM = 0;
  for (let i = 1; i < line.length; i++) {
    const pointA = line[i - 1];
    const pointB = line[i];
    const [ax, ay] = toLocal(point, [pointA.lng, pointA.lat]);
    const [bx, by] = toLocal(point, [pointB.lng, pointB.lat]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const fraction = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    const offM = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    const segmentM = distanceM(pointA, pointB);
    if (offM < best.offM) {
      best = { offM, alongM: startM + fraction * segmentM };
    }
    startM += segmentM;
  }
  return best;
}

/** Distance in metres from `point` to a line; Infinity for an empty line. */
export function distanceToLineM(point: LatLng, line: readonly Position[]): number {
  if (line.length === 1) {
    return distanceM(point, { lat: line[0][1], lng: line[0][0] });
  }
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, distanceToSegmentM(point, line[i - 1], line[i]));
  }
  return best;
}

/** True when `point` is inside the ring (even-odd rule). */
function insideRing(point: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[previous];
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when `point` is inside the polygon: in its outer ring and not in a hole. */
export function insidePolygon(point: LatLng, polygon: readonly Ring[]): boolean {
  return (
    polygon.length > 0 && insideRing(point, polygon[0]) && !polygon.slice(1).some((hole) => insideRing(point, hole))
  );
}

/** True when `point` is inside an area geometry; always false for lines. */
export function insideArea(point: LatLng, geometry: Geometry): boolean {
  if (geometry.type === "Polygon") {
    return insidePolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((coordinate) => insidePolygon(point, coordinate));
  }
  return false;
}

/** The lines of a line geometry, or the rings of an area. */
export function linesOf(geometry: Geometry): readonly (readonly Position[])[] {
  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  return geometry.coordinates.flat();
}

/**
 * True when `point` touches the geometry: inside an area, or within
 * `withinM` metres of a line or an area's edge.
 */
export function touches(point: LatLng, geometry: Geometry, withinM: number): boolean {
  if (insideArea(point, geometry)) {
    return true;
  }
  return linesOf(geometry).some((line) => distanceToLineM(point, line) <= withinM);
}

/** [west, south, east, north] of a geometry. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];

export function boundsOf(geometry: Geometry): Bounds {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of linesOf(geometry)) {
    for (const [lng, lat] of line) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return [west, south, east, north];
}

/** True when `point` is within `marginM` metres of the bounds (a cheap first check). */
export function nearBounds(point: LatLng, [west, south, east, north]: Bounds, marginM: number): boolean {
  const dLat = marginM / (RAD * EARTH_RADIUS_M);
  const dLng = dLat / Math.max(0.01, Math.cos(point.lat * RAD));
  return point.lat >= south - dLat && point.lat <= north + dLat && point.lng >= west - dLng && point.lng <= east + dLng;
}

/**
 * Points along a line, no more than `stepM` metres apart, including every
 * vertex: used to check a whole leg against the rules.
 */
export function samplesAlong(line: readonly LatLng[], stepM: number): LatLng[] {
  if (line.length === 0) {
    return [];
  }
  const samples: LatLng[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const pointA = line[i - 1];
    const pointB = line[i];
    const steps = Math.ceil(distanceM(pointA, pointB) / stepM);
    for (let step = 1; step <= steps; step++) {
      samples.push({
        lat: pointA.lat + ((pointB.lat - pointA.lat) * step) / steps,
        lng: pointA.lng + ((pointB.lng - pointA.lng) * step) / steps,
      });
    }
    if (steps === 0) {
      samples.push(pointB);
    }
  }
  return samples;
}
