// Geometry for the core, on top of turf: GeoJSON-style shapes in [lng, lat] order, the trip's
// points as { lat, lng }, distances in metres.
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { lineString, polygon as turfPolygon } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import pointToLineDistance from "@turf/point-to-line-distance";
import type { GeoJSON } from "geojson";
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

const METRES = { units: "meters" } as const;
const positionOf = (point: LatLng): number[] => [point.lng, point.lat];
const lineOf = (line: readonly LatLng[]) => lineString(line.map(positionOf));

/** Great-circle distance in metres. */
export function distanceM(pointA: LatLng, pointB: LatLng): number {
  return distance(positionOf(pointA), positionOf(pointB), METRES);
}

/** The point on a polyline (at least one point) nearest to `point`. */
export function nearestOnLine(point: LatLng, line: readonly LatLng[]): LatLng {
  if (line.length === 1) {
    return { lat: line[0].lat, lng: line[0].lng };
  }
  const [lng, lat] = nearestPointOnLine(lineOf(line), positionOf(point)).geometry.coordinates;
  return { lat, lng };
}

/**
 * Where `point` is nearest a polyline (at least one point): `offM`, its distance from the
 * line, and `alongM`, how far along the line from its first point that nearest spot is.
 */
export function projectOntoLine(point: LatLng, line: readonly LatLng[]): { offM: number; alongM: number } {
  if (line.length === 1) {
    return { offM: distanceM(point, line[0]), alongM: 0 };
  }
  const { pointDistance, totalDistance } = nearestPointOnLine(lineOf(line), positionOf(point), METRES).properties;
  return { offM: pointDistance, alongM: totalDistance };
}

/** Distance in metres from `point` to a line; Infinity for an empty line. */
export function distanceToLineM(point: LatLng, line: readonly Position[]): number {
  if (line.length === 0) {
    return Infinity;
  }
  if (line.length === 1) {
    return distanceM(point, { lat: line[0][1], lng: line[0][0] });
  }
  return pointToLineDistance(positionOf(point), lineString(line as unknown as number[][]), {
    ...METRES,
    // Lines are drawn straight on the map, so measure to them as drawn, not along a great circle.
    method: "planar",
  });
}

/** turf wants each ring to end where it starts; ours may leave the closing position out. */
function closeRing(ring: Ring): number[][] {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  return (isClosed ? ring : [...ring, first]) as unknown as number[][];
}

/** True when `point` is inside the polygon: in its outer ring and not in a hole. */
export function insidePolygon(point: LatLng, polygon: readonly Ring[]): boolean {
  return polygon.length > 0 && booleanPointInPolygon(positionOf(point), turfPolygon(polygon.map(closeRing)));
}

/** True when `point` is inside an area geometry; always false for lines. */
export function insideArea(point: LatLng, geometry: Geometry): boolean {
  if (geometry.type === "Polygon") {
    return insidePolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => insidePolygon(point, polygon));
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
  return bbox(geometry as unknown as GeoJSON) as unknown as Bounds;
}

const METRES_PER_DEGREE_LAT = 111_195;

/** True when `point` is within `marginM` metres of the bounds (a cheap first check). */
export function nearBounds(point: LatLng, [west, south, east, north]: Bounds, marginM: number): boolean {
  const dLat = marginM / METRES_PER_DEGREE_LAT;
  const dLng = dLat / Math.max(0.01, Math.cos((point.lat * Math.PI) / 180));
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
