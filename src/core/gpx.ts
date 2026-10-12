// GPX export (#11, ADR 0006): plans leave the app as GPX 1.1 for GPS devices
// and outdoor apps. Pure text building; the download happens outside the core.
import type { LegMode, Trip } from "./trip";

/** The names written into the file; user-facing text, so passed in (ADR 0013). */
export type GpxNames = {
  /** Used as the trip's name when it has none. */
  readonly untitledTrip: string;
  /** A leg's track name from its 1-based index and mode, e.g. "Leg 3 – paddle". */
  readonly leg: (n: number, mode: LegMode) => string;
  /** A camp's waypoint name from its 1-based number along the trip, e.g. "Camp 1". */
  readonly camp: (n: number) => string;
};

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** The trip as GPX 1.1 text. */
export function tripToGpx(trip: Trip, names: GpxNames): string {
  const tripName = trip.name.trim() || names.untitledTrip;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="packraft-go" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(tripName)}</name></metadata>`,
    "</gpx>",
    "",
  ].join("\n");
}
