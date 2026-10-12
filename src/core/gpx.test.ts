// GPX export (#11, #41, ADR 0021): one GPX 1.1 file per section, each with one
// track and one track segment, so course importers (e.g. Garmin Connect) see it all.
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { gpxZipFileName, tripToGpxFiles, type GpxNames } from "./gpx";
import { emptyTrip, type Trip } from "./trip";
import { strings } from "../ui/strings";

// The names the app passes in (ADR 0013), so these tests pin the exported names too.
const names: GpxNames = { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName };

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

const parsedFiles = (trip: Trip, gpxNames: GpxNames = names) =>
  tripToGpxFiles(trip, gpxNames).map((file) => ({ ...file, gpx: parseGpx11(file.text) }));

describe("GPX export: one file per section", () => {
  it("makes one valid GPX 1.1 file per section, each with exactly one track and one track segment", () => {
    const files = tripToGpxFiles(ourthe, names);
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(parseGpx11(file.text).tracks).toHaveLength(1);
      expect(file.text.match(/<trk>/g)).toHaveLength(1);
      expect(file.text.match(/<trkseg>/g)).toHaveLength(1);
    }
  });

  it("names each file, its metadata and its track '<trip> – <n> – <mode>' without camps", () => {
    const files = parsedFiles(ourthe);
    expect(files.map((f) => f.fileName)).toEqual(["Ourthe weekend – 1 – hike.gpx", "Ourthe weekend – 2 – paddle.gpx"]);
    for (const file of files) {
      const name = file.fileName.replace(/\.gpx$/, "");
      expect(file.gpx.metadataName).toBe(name);
      expect(file.gpx.tracks[0].name).toBe(name);
    }
  });

  it("adds the day to the names when the trip has camps", () => {
    const camped: Trip = { ...ourthe, camps: [2] };
    expect(tripToGpxFiles(camped, names).map((f) => f.fileName)).toEqual([
      "Ourthe weekend – 1 – Day 1 – hike.gpx",
      "Ourthe weekend – 2 – Day 1 – paddle.gpx",
      "Ourthe weekend – 3 – Day 2 – paddle.gpx",
    ]);
  });

  it("follows the routed geometry with elevations, without repeating the point where two legs meet", () => {
    const [hike, paddle] = parsedFiles(ourthe);
    expect(hike.gpx.tracks[0].points).toEqual([
      { lat: 50.3, lon: 5.6, ele: 120 },
      { lat: 50.305, lon: 5.605, ele: 180.5 },
      { lat: 50.31, lon: 5.61, ele: 150 },
    ]);
    expect(paddle.gpx.tracks[0].points).toEqual([
      { lat: 50.31, lon: 5.61, ele: 110 },
      { lat: 50.315, lon: 5.615, ele: 108 },
      { lat: 50.32, lon: 5.62, ele: 103 },
      { lat: 50.33, lon: 5.63, ele: 99 },
    ]);
  });

  it.each([
    ["not yet routed", undefined],
    ["still routing", { status: "pending" } as const],
    ["failed to route", { status: "failed", failure: { kind: "no-route" } } as const],
    ["routed without geometry", { status: "routed", geometry: [] } as const],
  ])("exports a leg %s as a straight line between its points, without elevation", (_, route) => {
    const trip: Trip = { ...ourthe, legs: [ourthe.legs[0], { mode: "paddle", route }, { mode: "paddle", route }] };
    expect(parsedFiles(trip)[1].gpx.tracks[0].points).toEqual([
      { lat: 50.31, lon: 5.61 },
      { lat: 50.32, lon: 5.62 },
      { lat: 50.33, lon: 5.63 },
    ]);
  });

  it("exports no camps as waypoints", () => {
    for (const file of parsedFiles({ ...ourthe, camps: [0, 2, 3] })) expect(file.gpx.waypoints).toEqual([]);
  });

  it("makes no files for a trip without legs", () => {
    expect(tripToGpxFiles(emptyTrip(), names)).toEqual([]);
    expect(tripToGpxFiles({ name: "Start", points: [A], legs: [] }, names)).toEqual([]);
  });

  it("names an unnamed trip's sections with the untitled name", () => {
    expect(parsedFiles({ ...ourthe, name: "  " })[0].gpx.metadataName).toBe("Untitled trip – 1 – hike");
  });

  it("escapes names, so any trip name gives valid XML", () => {
    const name = `Lesse & Ourthe <day "1"> 'n' more`;
    const [first] = parsedFiles({ ...ourthe, name });
    expect(first.gpx.metadataName).toBe(`${name} – 1 – hike`);
    expect(first.gpx.tracks[0].name).toBe(`${name} – 1 – hike`);
  });

  it("makes file names safe for file systems, keeping the rest of the name", () => {
    expect(tripToGpxFiles({ ...ourthe, name: "Lesse / Ourthe: day 1?" }, names)[0].fileName).toBe(
      "Lesse - Ourthe- day 1- – 1 – hike.gpx",
    );
  });

  it("drops characters XML 1.0 does not allow from every name it writes, keeping the rest", () => {
    const odd: GpxNames = { untitledTrip: "x", section: (trip, n) => `${trip}\u0001 ${n}￿\uD800` };
    const [first] = parsedFiles({ ...ourthe, name: "Bell\u0007 trip\u001F 🛶" }, odd);
    expect(first.gpx.metadataName).toBe("Bell trip 🛶 1");
    expect(first.gpx.tracks[0].name).toBe("Bell trip 🛶 1");
  });

  it("writes longitude 180 as -180, the same place, since GPX 1.1 only allows -180 up to 180", () => {
    const trip: Trip = { name: "Date line", points: [{ lat: 0, lng: 179.9 }, { lat: 0, lng: 180 }], legs: [{ mode: "hike" }] };
    expect(parsedFiles(trip)[0].gpx.tracks[0].points[1]).toEqual({ lat: 0, lon: -180 });
  });

  it("wraps a longitude that only rounds to 180 to -180, and keeps latitudes that round to ±90 in range", () => {
    const trip: Trip = {
      name: "Edges",
      points: [{ lat: 89.99999999, lng: 179.99999999 }, { lat: -89.99999999, lng: -179.99999999 }],
      legs: [{ mode: "hike" }],
    };
    expect(parsedFiles(trip)[0].gpx.tracks[0].points).toEqual([
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
    const [file] = tripToGpxFiles(trip, names);
    expect(file.text).not.toMatch(/\de-?\d/i);
    expect(parseGpx11(file.text).tracks[0].points[0]).toEqual({ lat: 0.0000001, lon: -0.0000002, ele: 0 });
  });
});

describe("GPX ZIP file name", () => {
  it("is named after the trip, ending in .zip", () => {
    expect(gpxZipFileName(ourthe, "Untitled trip")).toBe("Ourthe weekend.zip");
  });

  it("uses the untitled name for a trip without a name", () => {
    expect(gpxZipFileName(emptyTrip(), "Untitled trip")).toBe("Untitled trip.zip");
    expect(gpxZipFileName({ ...emptyTrip(), name: "  " }, "Untitled trip")).toBe("Untitled trip.zip");
  });

  it("replaces characters that file systems do not allow, like the save file", () => {
    expect(gpxZipFileName({ ...emptyTrip(), name: "Lesse / Ourthe: day 1?" }, "Untitled trip")).toBe("Lesse - Ourthe- day 1-.zip");
  });
});
