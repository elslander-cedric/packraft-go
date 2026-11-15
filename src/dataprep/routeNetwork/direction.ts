// Which way a Walloon stretch record's water flows, from OSM (ADR 0039): a river's ways
// point downstream. Each way along the record votes with how far it runs along the line,
// and a record whose ways disagree is reported for review.
import type { Position } from "@/core/geo";
import { project, type Pt } from "../walloonStretches/geo";
import type { OverpassElement, OverpassResult } from "../walloonStretches/overpass";

/** How close to the record's line a way's points must be to count as that water. */
const ON_LINE_M = 20;

export const toPt = ([lng, lat]: Position): Pt => ({ lat, lng });

export type Orientation = {
  /** The record's line in the direction the water flows (for a canal, as it was). */
  readonly line: readonly Pt[];
  readonly canal: boolean;
  /** How far the OSM ways along the record run with the line as given, and against it, in metres. */
  readonly withM: number;
  readonly againstM: number;
};

type Vote = { alongM: number; canal: boolean };

/** How far one way runs along the line (negative: against it), counting only its parts on the line. */
function vote(line: readonly Pt[], way: OverpassElement): Vote {
  const points = (way.geometry ?? []).flatMap((point) => (point ? [{ lat: point.lat, lng: point.lon }] : []));
  let alongM = 0;
  let previous: { along: number; distance: number } | undefined;
  for (const point of points) {
    const here = project(line, point);
    if (previous && previous.distance <= ON_LINE_M && here.distance <= ON_LINE_M) {
      alongM += here.along - previous.along;
    }
    previous = here;
  }
  return { alongM, canal: way.tags?.waterway === "canal" };
}

const isWaterway = (element: OverpassElement) =>
  element.type === "way" && ["river", "stream", "canal"].includes(element.tags?.waterway ?? "");

/** The record's line, oriented downstream by its OSM ways; undefined when no way runs along it. */
export function orientRecord(line: readonly Position[], osm: OverpassResult): Orientation | undefined {
  const points = line.map(toPt);
  const votes = osm.elements.filter(isWaterway).map((way) => vote(points, way));
  const withM = votes.reduce((sum, { alongM }) => sum + Math.max(0, alongM), 0);
  const againstM = votes.reduce((sum, { alongM }) => sum + Math.max(0, -alongM), 0);
  if (withM + againstM === 0) {
    return undefined;
  }
  const canalM = votes.filter(({ canal }) => canal).reduce((sum, { alongM }) => sum + Math.abs(alongM), 0);
  const canal = canalM * 2 > withM + againstM;
  const reverse = !canal && againstM > withM;
  return { line: reverse ? [...points].reverse() : points, canal, withM, againstM };
}
