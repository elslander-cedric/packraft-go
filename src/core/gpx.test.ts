// GPX export (#11, #41, ADR 0037): one GPX 1.1 file with one track and one track
// segment through the whole trip, so course importers (e.g. Garmin Connect) see it
// all, and a waypoint where each section starts, shown as course points.
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { tripToGpx, type GpxFile, type GpxNames } from "./gpx";
import { emptyTrip, type Trip } from "./trip";
import { strings } from "../ui/strings";

// The names the app passes in (ADR 0013), so these tests pin the exported names too.
const names: GpxNames = { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName, end: strings.gpxEnd };

const A = { lat: 50.3, lng: 5.6 };
const B = { lat: 50.31, lng: 5.61 };
const C = { lat: 50.32, lng: 5.62 };
const D = { lat: 50.33, lng: 5.63 };

/** A hike leg to the put-in at B, then two paddle legs to D. */
const ourthe: Trip = {
  name: "Ourthe weekend",
  points: [A, B, C, D],
  legs: [
    {
      mode: "hike",
      route: {
        status: "routed",
        geometry: [
          { ...A, elevation: 120 },
          { lat: 50.305, lng: 5.605, elevation: 180.5 },
          { ...B, elevation: 150 },
        ],
        climbM: 60,
      },
    },
    {
      mode: "paddle",
      route: {
        status: "routed",
        geometry: [
          { ...B, elevation: 110 },
          { lat: 50.315, lng: 5.615, elevation: 108 },
          { ...C, elevation: 103 },
        ],
      },
    },
    {
      mode: "paddle",
      route: {
        status: "routed",
        geometry: [
          { ...C, elevation: 103 },
          { ...D, elevation: 99 },
        ],
      },
    },
  ],
};

/** The export of a trip with legs, parsed with the GPX 1.1 structure check. */
function exported(trip: Trip, gpxNames: GpxNames = names): GpxFile & { gpx: ReturnType<typeof parseGpx11> } {
  const file = tripToGpx(trip, gpxNames);
  if (!file) throw new Error("no GPX for this trip");
  return { ...file, gpx: parseGpx11(file.text) };
}

const ourthePoints = [
  { lat: 50.3, lon: 5.6, ele: 120 },
  { lat: 50.305, lon: 5.605, ele: 180.5 },
  { lat: 50.31, lon: 5.61, ele: 150 },
  { lat: 50.315, lon: 5.615, ele: 108 },
  { lat: 50.32, lon: 5.62, ele: 103 },
  { lat: 50.33, lon: 5.63, ele: 99 },
];

describe("GPX export: one file, one track, a waypoint per section", () => {
  it("makes one valid GPX 1.1 file with exactly one track and one track segment", () => {
    const { text, gpx } = exported(ourthe);
    expect(gpx.tracks).toHaveLength(1);
    expect(text.match(/<trk>/g)).toHaveLength(1);
    expect(text.match(/<trkseg>/g)).toHaveLength(1);
  });

  it("names the file, its metadata and its track after the trip", () => {
    const { fileName, gpx } = exported(ourthe);
    expect(fileName).toBe("Ourthe weekend.gpx");
    expect(gpx.metadataName).toBe("Ourthe weekend");
    expect(gpx.tracks[0].name).toBe("Ourthe weekend");
  });

  it("follows the routed geometry with elevations, without repeating the point where two legs meet", () => {
    expect(exported(ourthe).gpx.tracks[0].points).toEqual(ourthePoints);
  });

  it("marks where each section starts, '<n> – <mode>', and where the trip ends", () => {
    // The paddle section starts where the hike's geometry ends, the point on the track.
    expect(exported(ourthe).gpx.waypoints).toEqual([
      { ...ourthePoints[0], name: "1 – hike" },
      { ...ourthePoints[2], name: "2 – paddle" },
      { ...ourthePoints[5], name: "End" },
    ]);
  });

  it("adds the day to the section waypoints when the trip has camps, and keeps one track", () => {
    const { gpx } = exported({ ...ourthe, camps: [2] });
    expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – Day 1 – hike", "2 – Day 1 – paddle", "3 – Day 2 – paddle", "End"]);
    expect(gpx.waypoints[2]).toMatchObject({ lat: 50.32, lon: 5.62 });
    expect(gpx.tracks).toHaveLength(1);
    expect(gpx.tracks[0].points).toEqual(ourthePoints);
  });

  it("writes the waypoints before the track, as GPX 1.1 requires", () => {
    const { text } = exported(ourthe);
    expect(text.lastIndexOf("<wpt")).toBeLessThan(text.indexOf("<trk>"));
  });

  it.each([
    ["not yet routed", undefined],
    ["still routing", { status: "pending" } as const],
    ["failed to route", { status: "failed", failure: { kind: "no-route" } } as const],
    ["routed without geometry", { status: "routed", geometry: [] } as const],
  ])("exports a leg %s as a straight line between its points, without elevation", (_, route) => {
    const trip: Trip = { ...ourthe, legs: [ourthe.legs[0], { mode: "paddle", route }, { mode: "paddle", route }] };
    expect(exported(trip).gpx.tracks[0].points.slice(2)).toEqual([
      { lat: 50.31, lon: 5.61, ele: 150 },
      { lat: 50.32, lon: 5.62 },
      { lat: 50.33, lon: 5.63 },
    ]);
  });

  it("makes no file for a trip without legs", () => {
    expect(tripToGpx(emptyTrip(), names)).toBeUndefined();
    expect(tripToGpx({ name: "Start", points: [A], legs: [] }, names)).toBeUndefined();
  });

  it("names an unnamed trip with the untitled name", () => {
    const { fileName, gpx } = exported({ ...ourthe, name: "  " });
    expect(fileName).toBe("Untitled trip.gpx");
    expect(gpx.metadataName).toBe("Untitled trip");
  });

  it("escapes names, so any trip name gives valid XML", () => {
    const name = `Lesse & Ourthe <day "1"> 'n' more`;
    const { gpx } = exported({ ...ourthe, name });
    expect(gpx.metadataName).toBe(name);
    expect(gpx.tracks[0].name).toBe(name);
  });

  it("makes the file name safe for file systems, keeping the name inside as typed", () => {
    const { fileName, gpx } = exported({ ...ourthe, name: "Lesse / Ourthe: day 1?" });
    expect(fileName).toBe("Lesse - Ourthe- day 1-.gpx");
    expect(gpx.metadataName).toBe("Lesse / Ourthe: day 1?");
  });

  it("drops characters XML 1.0 does not allow from every name it writes, keeping the rest", () => {
    const odd: GpxNames = { untitledTrip: "x", section: (n) => `\u0001${n}\uFFFF\uD800`, end: "E\u0007nd" };
    const { gpx } = exported({ ...ourthe, name: "Bell\u0007 trip\u001F 🛶" }, odd);
    expect(gpx.metadataName).toBe("Bell trip 🛶");
    expect(gpx.tracks[0].name).toBe("Bell trip 🛶");
    expect(gpx.waypoints.map((w) => w.name)).toEqual(["1", "2", "End"]);
  });

  it("writes longitude 180 as -180, the same place, since GPX 1.1 only allows -180 up to 180", () => {
    const trip: Trip = { name: "Date line", points: [{ lat: 0, lng: 179.9 }, { lat: 0, lng: 180 }], legs: [{ mode: "hike" }] };
    const { gpx } = exported(trip);
    expect(gpx.tracks[0].points[1]).toEqual({ lat: 0, lon: -180 });
    expect(gpx.waypoints[1]).toEqual({ lat: 0, lon: -180, name: "End" });
  });

  it("wraps a longitude that only rounds to 180 to -180, and keeps latitudes that round to ±90 in range", () => {
    const trip: Trip = {
      name: "Edges",
      points: [{ lat: 89.99999999, lng: 179.99999999 }, { lat: -89.99999999, lng: -179.99999999 }],
      legs: [{ mode: "hike" }],
    };
    expect(exported(trip).gpx.tracks[0].points).toEqual([
      { lat: 90, lon: -180 },
      { lat: -90, lon: -180 },
    ]);
  });

  it("writes very small numbers as plain decimals, which GPX requires (no 1e-7)", () => {
    const trip: Trip = {
      name: "Tiny",
      points: [{ lat: 0.0000001, lng: -0.0000002 }, B],
      legs: [{ mode: "hike", route: { status: "routed", geometry: [{ lat: 0.0000001, lng: -0.0000002, elevation: 0.000001 }, { ...B, elevation: 1 }] } }],
    };
    const { text, gpx } = exported(trip);
    expect(text).not.toMatch(/\de-?\d/i);
    expect(gpx.tracks[0].points[0]).toEqual({ lat: 0.0000001, lon: -0.0000002, ele: 0 });
  });
});
