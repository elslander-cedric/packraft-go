// Builds the built-in access datasets from OpenStreetMap answers (ADR 0024).
// `overpass` answers one Overpass QL query; the script passes a polite, cached
// fetch, tests pass saved extracts.
import type { AccessRecord, Geometry } from "@/core/access";
import { ACCESS_DATA_FORMAT, OSM_ATTRIBUTION, type AccessDataset } from "../dataset";
import {
  areasOf,
  clipLine,
  cutBetween,
  insideAny,
  mergeLines,
  relationArea,
  roundPosition,
  simplifyLine,
  simplifyPolygon,
  waysOf,
  type Line,
  type OverpassResponse,
  type Polygon,
} from "./osm";
import { flandersWaterSpecs, RESEARCHED, regionSpecs, type RegionSpec, type WaterSpec } from "./sources";

export type Overpass = (query: string) => Promise<OverpassResponse>;

/** Region boundaries are simplified more than waters: a few tens of metres don't matter there. */
const REGION_TOLERANCE_M = 60;

/** Wraps statements into a full query that returns geometry. */
export const geometryQuery = (statements: string) => `[out:json][timeout:180];\n(${statements});\nout geom;`;

const roundLine = (line: Line): Line => line.map(roundPosition);
const roundPolygon = (polygon: Polygon): Polygon => polygon.map(roundLine);

const middleOf = (ring: Line): Line[number] => [
  ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
  ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
];

function multiPolygon(polygons: Polygon[]): Geometry {
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function multiLine(lines: Line[]): Geometry {
  return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
}

export async function regionRecord(spec: RegionSpec, overpass: Overpass): Promise<AccessRecord> {
  const { relationId, ...record } = spec;
  const area = relationArea(await overpass(geometryQuery(`relation(${relationId});`)), relationId)
    .map((polygon) => simplifyPolygon(polygon, REGION_TOLERANCE_M))
    .filter((polygon): polygon is Polygon => polygon !== null)
    .map(roundPolygon);
  if (area.length === 0) throw new Error(`region ${spec.id}: no area`);
  return { ...record, scope: "region", region: spec.id, geometry: multiPolygon(area), researched: RESEARCHED };
}

/**
 * One water's record: its ways or areas, kept inside its region (and envelope),
 * cut between its end points, simplified and rounded.
 */
export async function waterRecord(spec: WaterSpec, regionArea: readonly Polygon[], overpass: Overpass): Promise<AccessRecord> {
  const { query, shape, include, envelope, between, toleranceM, ...record } = spec;
  const answer = await overpass(geometryQuery(query));
  const limits = [insideAny(regionArea), ...(envelope ? [insideAny([[envelope]])] : [])];
  const inLimits = (p: Line[number]) => limits.every((inside) => inside(p));

  let geometry: Geometry;
  if (shape === "areas") {
    // An area belongs to the water when its middle (the mean of its outer corners) is inside the limits:
    // a dock's corners often lie on the quay that edges a mapped port area.
    const areas = areasOf(answer, include ?? (() => true))
      .filter((polygon) => inLimits(middleOf(polygon[0])))
      .map((polygon) => simplifyPolygon(polygon, toleranceM))
      .filter((polygon): polygon is Polygon => polygon !== null)
      .map(roundPolygon);
    if (areas.length === 0) throw new Error(`water ${spec.id}: no areas`);
    geometry = multiPolygon(areas);
  } else {
    let lines = mergeLines(waysOf(answer, include)).flatMap((line) => clipLine(line, inLimits));
    if (between) {
      lines = mergeLines(lines);
      const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
      lines = [cutBetween(longest, between.from, between.to)];
    }
    lines = lines
      .map((line) => roundLine(simplifyLine(line, toleranceM)))
      .filter((line) => line.length >= 2);
    if (lines.length === 0) throw new Error(`water ${spec.id}: no lines`);
    geometry = multiLine(lines);
  }
  return { ...record, scope: "water", geometry, researched: RESEARCHED };
}

const regionAreaOf = (record: AccessRecord): Polygon[] =>
  record.geometry.type === "Polygon"
    ? [record.geometry.coordinates.map((ring) => [...ring])]
    : record.geometry.type === "MultiPolygon"
      ? record.geometry.coordinates.map((polygon) => polygon.map((ring) => [...ring]))
      : [];

/** Builds every dataset. `extracted` is today's date, YYYY-MM-DD. */
export async function buildAccessData(overpass: Overpass, extracted: string): Promise<AccessDataset[]> {
  const regions: AccessRecord[] = [];
  for (const spec of regionSpecs) regions.push(await regionRecord(spec, overpass));
  const flandersArea = regionAreaOf(regions.find((r) => r.id === "flanders")!);
  const flanders: AccessRecord[] = [];
  for (const spec of flandersWaterSpecs) flanders.push(await waterRecord(spec, flandersArea, overpass));
  const dataset = (id: string, title: string, records: AccessRecord[]): AccessDataset => ({
    format: ACCESS_DATA_FORMAT,
    version: 1,
    id,
    title,
    attribution: OSM_ATTRIBUTION,
    extracted,
    records,
  });
  return [
    dataset("regions", "Regions and their default rules", regions),
    dataset("flanders", "Flemish exceptions and VMM agreement stretches", flanders),
  ];
}
