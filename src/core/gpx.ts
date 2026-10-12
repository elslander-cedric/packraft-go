// GPX export (#11, #41; ADR 0006, ADR 0021): plans leave the app as GPX 1.1 for
// GPS devices and outdoor apps, one file per section so each imports as one
// course. Pure text building; zipping and the download happen outside the core.
import { safeFileName, tripFileName } from "./fileName";
import { tripSections, type Section } from "./sections";
import type { LatLng, LegMode, Trip } from "./trip";

/** The names written into the files; user-facing text, so passed in (ADR 0013). */
export type GpxNames = {
  /** Used as the trip's name when it has none. */
  readonly untitledTrip: string;
  /**
   * A section's name from the trip's name, its 1-based position and mode, and
   * its day when the trip has camps, e.g. "Ourthe – 2 – Day 1 – paddle".
   */
  readonly section: (tripName: string, n: number, mode: LegMode, day?: number) => string;
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
 * The section's points in order. Each leg after the first starts where the one
 * before it ends, so its first point is left out rather than repeated.
 */
function sectionGeometry(trip: Trip, section: Section): GpxPoint[] {
  const points: GpxPoint[] = [];
  for (let leg = section.firstLeg; leg <= section.lastLeg; leg += 1) {
    const geometry = legGeometry(trip, leg);
    points.push(...(leg === section.firstLeg ? geometry : geometry.slice(1)));
  }
  return points;
}

/** GPX 1.1 text with `name` in its metadata and one track of one segment through `points`. */
function gpxText(name: string, points: readonly GpxPoint[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="packraft-go" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${escapeXml(name)}</name></metadata>`,
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

/** Ending of an exported GPX file's name. */
export const GPX_FILE_EXTENSION = ".gpx";

/** One exported GPX file: its file name and its text. */
export type GpxFile = { readonly fileName: string; readonly text: string };

/**
 * The trip as GPX 1.1 files, one per section in trip order (ADR 0021). The
 * section's name is the metadata and track name; the file name is that name
 * made safe for file systems. A trip without legs gives no files.
 */
export function tripToGpxFiles(trip: Trip, names: GpxNames): GpxFile[] {
  const tripName = trip.name.trim() || names.untitledTrip;
  const hasCamps = (trip.camps ?? []).length > 0;
  return tripSections(trip).map((section, i) => {
    const name = names.section(tripName, i + 1, section.mode, hasCamps ? section.day : undefined);
    return {
      fileName: safeFileName(name, names.untitledTrip, GPX_FILE_EXTENSION),
      text: gpxText(name, sectionGeometry(trip, section)),
    };
  });
}

/** Ending of the exported ZIP file's name. */
export const GPX_ZIP_FILE_EXTENSION = ".zip";

/** The ZIP file holding the GPX files: the trip's name, or `untitledName` for a trip without one. */
export function gpxZipFileName(trip: Trip, untitledName: string): string {
  return tripFileName(trip, untitledName, GPX_ZIP_FILE_EXTENSION);
}
