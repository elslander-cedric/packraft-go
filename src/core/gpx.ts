// GPX export (ADR 0006, ADR 0037): plans leave the app as one GPX 1.1
// file for GPS devices and outdoor apps: one track through the whole trip, so it
// imports as one course, and a waypoint where each section starts, which course
// importers show as course points. Pure text building; the download happens outside the core.
import { tripFileName } from "./fileName";
import { tripSections, type Section } from "./sections";
import type { LatLng, LegMode, Trip } from "./trip";

/** The names written into the file; user-facing text, so passed in (ADR 0013). */
export type GpxNames = {
  /** Used as the trip's name when it has none. */
  readonly untitledTrip: string;
  /**
   * The name of the waypoint where a section starts, from its 1-based position
   * and mode, and its day when the trip has camps, e.g. "2 – Day 1 – paddle".
   */
  readonly section: (n: number, mode: LegMode, day?: number) => string;
  /** The name of the waypoint where the trip ends. */
  readonly end: string;
};

/** A point as written to the file; `elevation` in metres, absent when unknown. */
type GpxPoint = LatLng & { readonly elevation?: number };

// Characters outside XML 1.0's Char production (control characters, U+FFFE/U+FFFF, lone
// surrogates): not allowed even escaped. A trip name can hold them, e.g. from an opened file.
const notXmlChar = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** Text safe to write in XML: characters XML 1.0 does not allow dropped, markup escaped. */
const escapeXml = (value: string) =>
  value
    .replace(notXmlChar, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A plain decimal (GPX does not allow exponents like 1e-7), without trailing zeros. */
function decimal(value: number, digits: number): string {
  const text = value.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return text === "-0" ? "0" : text;
}

/**
 * Latitude and longitude attributes, checked after rounding so the written
 * values are in GPX bounds: -90 <= lat <= 90, and -180 <= lon < 180, so a
 * longitude that is (or rounds to) 180 is written as -180, the same meridian.
 */
function position({ lat, lng }: LatLng): string {
  const rounded = (value: number) => Number(decimal(value, 7));
  const latitude = Math.min(90, Math.max(-90, rounded(lat)));
  let longitude = Math.min(180, Math.max(-180, rounded(lng)));
  if (longitude === 180) longitude = -180;
  return `lat="${decimal(latitude, 7)}" lon="${decimal(longitude, 7)}"`;
}

const elevationOf = (point: GpxPoint) =>
  point.elevation === undefined ? "" : `<ele>${decimal(point.elevation, 2)}</ele>`;

/**
 * Where leg `index` runs: its routed geometry with elevations, or a straight
 * line between its points without elevation when it is not routed (yet).
 */
function legGeometry(trip: Trip, index: number): readonly GpxPoint[] {
  const route = trip.legs[index].route;
  if (route?.status === "routed" && route.geometry.length > 0) return route.geometry;
  return [trip.points[index], trip.points[index + 1]];
}

/**
 * The trip's points in order, and where in them each section starts. Each leg
 * after the first starts where the one before it ends, so its first point is
 * left out rather than repeated.
 */
function tripGeometry(trip: Trip, sections: readonly Section[]): { points: GpxPoint[]; sectionStarts: number[] } {
  const points: GpxPoint[] = [];
  const sectionStarts: number[] = [];
  for (const section of sections) {
    sectionStarts.push(Math.max(0, points.length - 1));
    for (let leg = section.firstLeg; leg <= section.lastLeg; leg += 1) {
      const geometry = legGeometry(trip, leg);
      points.push(...(leg === 0 ? geometry : geometry.slice(1)));
    }
  }
  return { points, sectionStarts };
}

/** A named waypoint as GPX: position, then elevation, then name (the schema's order). */
const waypoint = (point: GpxPoint, name: string) =>
  `  <wpt ${position(point)}>${elevationOf(point)}<name>${escapeXml(name)}</name></wpt>`;

/** GPX 1.1 text: `name` in its metadata, the waypoints, then one track of one segment through `points`. */
function gpxText(name: string, waypoints: readonly string[], points: readonly GpxPoint[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="packraft-go" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${escapeXml(name)}</name></metadata>`,
    ...waypoints,
    `  <trk>`,
    `    <name>${escapeXml(name)}</name>`,
    `    <trkseg>`,
    ...points.map((point) => `      <trkpt ${position(point)}>${elevationOf(point)}</trkpt>`),
    `    </trkseg>`,
    `  </trk>`,
    "</gpx>",
    "",
  ].join("\n");
}

/** Ending of the exported GPX file's name. */
export const GPX_FILE_EXTENSION = ".gpx";

/** The exported GPX file: its file name and its text. */
export type GpxFile = { readonly fileName: string; readonly text: string };

/**
 * The trip as one GPX 1.1 file (ADR 0037): the trip's name as metadata and
 * track name, one track of one segment through every leg, and a waypoint where
 * each section starts plus one where the trip ends. The file is named after the
 * trip, made safe for file systems. A trip without legs gives no file.
 */
export function tripToGpx(trip: Trip, names: GpxNames): GpxFile | undefined {
  const sections = tripSections(trip);
  if (sections.length === 0) return undefined;
  const tripName = trip.name.trim() || names.untitledTrip;
  const hasCamps = (trip.camps ?? []).length > 0;
  const { points, sectionStarts } = tripGeometry(trip, sections);
  const waypoints = [
    ...sections.map((section, i) =>
      waypoint(points[sectionStarts[i]], names.section(i + 1, section.mode, hasCamps ? section.day : undefined)),
    ),
    waypoint(points[points.length - 1], names.end),
  ];
  return {
    fileName: tripFileName(trip, names.untitledTrip, GPX_FILE_EXTENSION),
    text: gpxText(tripName, waypoints, points),
  };
}
