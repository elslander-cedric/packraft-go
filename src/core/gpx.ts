// GPX export (#11, ADR 0006): plans leave the app as GPX 1.1 for GPS devices
// and outdoor apps. Pure text building; the download happens outside the core.
import { tripFileName } from "./fileName";
import type { LatLng, LegMode, Trip } from "./trip";

/** The names written into the file; user-facing text, so passed in (ADR 0013). */
export type GpxNames = {
  /** Used as the trip's name when it has none. */
  readonly untitledTrip: string;
  /** A leg's track name from its 1-based index and mode, e.g. "Leg 3 – paddle". */
  readonly leg: (n: number, mode: LegMode) => string;
  /** A camp's waypoint name from its 1-based number along the trip, e.g. "Camp 1". */
  readonly camp: (n: number) => string;
};

/** A point as written to the file; `elevation` in metres, absent when unknown. */
type GpxPoint = LatLng & { readonly elevation?: number };

// Characters outside XML 1.0's Char production (control characters, U+FFFE/U+FFFF, lone
// surrogates): not allowed even escaped. A trip name can hold them, e.g. from an opened file.
const notXmlChar = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

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

/** A camp's elevation: where the leg arriving there ends, or else where the leg leaving it starts, when routed. */
function campPoint(trip: Trip, point: number): GpxPoint {
  const routed = (leg: number) => {
    const route = trip.legs[leg]?.route;
    return route?.status === "routed" && route.geometry.length > 0 ? route.geometry : undefined;
  };
  const elevation = routed(point - 1)?.at(-1)?.elevation ?? routed(point)?.[0]?.elevation;
  return elevation === undefined ? trip.points[point] : { ...trip.points[point], elevation };
}

/** The trip as GPX 1.1 text: the trip's name, camps as waypoints, and one track per leg. */
export function tripToGpx(trip: Trip, names: GpxNames): string {
  const tripName = trip.name.trim() || names.untitledTrip;
  const waypoints = (trip.camps ?? []).map((point, i) => {
    const camp = campPoint(trip, point);
    return `  <wpt ${position(camp)}>${elevationOf(camp)}<name>${escapeXml(names.camp(i + 1))}</name></wpt>`;
  });
  const tracks = trip.legs.map((leg, i) =>
    [
      `  <trk>`,
      `    <name>${escapeXml(names.leg(i + 1, leg.mode))}</name>`,
      `    <trkseg>`,
      ...legGeometry(trip, i).map((point) => `      <trkpt ${position(point)}>${elevationOf(point)}</trkpt>`),
      `    </trkseg>`,
      `  </trk>`,
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="packraft-go" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${escapeXml(tripName)}</name></metadata>`,
    ...waypoints,
    ...tracks,
    "</gpx>",
    "",
  ].join("\n");
}

/** Ending of an exported GPX file's name. */
export const GPX_FILE_EXTENSION = ".gpx";

/** The GPX file's name: the trip's name, or `untitledName` for a trip without one. */
export function gpxFileName(trip: Trip, untitledName: string): string {
  return tripFileName(trip, untitledName, GPX_FILE_EXTENSION);
}
