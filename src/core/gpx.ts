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

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A plain decimal (GPX does not allow exponents like 1e-7), without trailing zeros. */
function decimal(value: number, digits: number): string {
  const text = value.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return text === "-0" ? "0" : text;
}

/** Latitude and longitude attributes. GPX longitudes run from -180 up to (not including) 180. */
function position({ lat, lng }: LatLng): string {
  return `lat="${decimal(lat, 7)}" lon="${decimal(lng === 180 ? -180 : lng, 7)}"`;
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
