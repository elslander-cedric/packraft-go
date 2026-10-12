// GPX export (#11, ADR 0006): the trip as a GPX 1.1 file, one track per leg, camps as waypoints.
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { gpxFileName, tripToGpx, type GpxNames } from "./gpx";
import { emptyTrip, type Trip } from "./trip";

const names: GpxNames = {
  untitledTrip: "Untitled trip",
  leg: (n, mode) => `Leg ${n} – ${mode}`,
  camp: (n) => `Camp ${n}`,
};

const A = { lat: 50.3, lng: 5.6 };
const B = { lat: 50.31, lng: 5.61 };
const C = { lat: 50.32, lng: 5.62 };

/** A hike leg to the put-in at B (a camp), then a paddle leg to C. */
const ourthe: Trip = {
  name: "Ourthe weekend",
  points: [A, B, C],
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
  ],
  camps: [1],
};

describe("GPX export", () => {
  it("is valid GPX 1.1 with the trip's name in the metadata", () => {
    const gpx = parseGpx11(tripToGpx(ourthe, names));
    expect(gpx.metadataName).toBe("Ourthe weekend");
  });

  it("has one track per leg, named with its index and mode, following the routed geometry with elevations", () => {
    const gpx = parseGpx11(tripToGpx(ourthe, names));
    expect(gpx.tracks).toEqual([
      {
        name: "Leg 1 – hike",
        points: [
          { lat: 50.3, lon: 5.6, ele: 120 },
          { lat: 50.305, lon: 5.605, ele: 180.5 },
          { lat: 50.31, lon: 5.61, ele: 150 },
        ],
      },
      {
        name: "Leg 2 – paddle",
        points: [
          { lat: 50.31, lon: 5.61, ele: 110 },
          { lat: 50.315, lon: 5.615, ele: 108 },
          { lat: 50.32, lon: 5.62, ele: 103 },
        ],
      },
    ]);
  });

  it("exports camps as named waypoints, numbered along the trip", () => {
    const twoCamps: Trip = { ...ourthe, camps: [1, 2] };
    expect(parseGpx11(tripToGpx(twoCamps, names)).waypoints).toEqual([
      { lat: 50.31, lon: 5.61, ele: 150, name: "Camp 1" },
      { lat: 50.32, lon: 5.62, ele: 103, name: "Camp 2" },
    ]);
  });

  it("has no waypoints for a trip without camps", () => {
    expect(parseGpx11(tripToGpx({ ...ourthe, camps: undefined }, names)).waypoints).toEqual([]);
  });

  it.each([
    ["not yet routed", undefined],
    ["still routing", { status: "pending" } as const],
    ["failed to route", { status: "failed", failure: { kind: "no-route" } } as const],
    ["routed without geometry", { status: "routed", geometry: [] } as const],
  ])("exports a leg %s as a straight line between its points, without elevation", (_, route) => {
    const trip: Trip = { ...ourthe, legs: [ourthe.legs[0], { mode: "paddle", route }] };
    const gpx = parseGpx11(tripToGpx(trip, names));
    expect(gpx.tracks[1]).toEqual({
      name: "Leg 2 – paddle",
      points: [
        { lat: 50.31, lon: 5.61 },
        { lat: 50.32, lon: 5.62 },
      ],
    });
  });

  it("gives a camp the elevation of the routed leg next to it, and none when no leg next to it is routed", () => {
    const trip: Trip = { ...ourthe, legs: [{ mode: "hike" }, ourthe.legs[1]], camps: [0, 1, 2] };
    expect(parseGpx11(tripToGpx(trip, names)).waypoints).toEqual([
      { lat: 50.3, lon: 5.6, name: "Camp 1" },
      { lat: 50.31, lon: 5.61, ele: 110, name: "Camp 2" },
      { lat: 50.32, lon: 5.62, ele: 103, name: "Camp 3" },
    ]);
  });

  it("names an unnamed trip with the untitled name", () => {
    expect(parseGpx11(tripToGpx({ ...ourthe, name: "  " }, names)).metadataName).toBe("Untitled trip");
  });

  it("escapes names, so any trip name gives valid XML", () => {
    const name = `Lesse & Ourthe <day "1"> 'n' more`;
    expect(parseGpx11(tripToGpx({ ...ourthe, name }, names)).metadataName).toBe(name);
  });

  it("is valid for an empty trip and a trip with only a start point", () => {
    expect(parseGpx11(tripToGpx(emptyTrip(), names))).toEqual({ metadataName: "Untitled trip", waypoints: [], tracks: [] });
    const start: Trip = { name: "Start", points: [A], legs: [], camps: [0] };
    expect(parseGpx11(tripToGpx(start, names))).toEqual({
      metadataName: "Start",
      waypoints: [{ lat: 50.3, lon: 5.6, name: "Camp 1" }],
      tracks: [],
    });
  });

  it("writes longitude 180 as -180, the same place, since GPX 1.1 only allows -180 up to 180", () => {
    const trip: Trip = { name: "Date line", points: [{ lat: 0, lng: 179.9 }, { lat: 0, lng: 180 }], legs: [{ mode: "hike" }] };
    expect(parseGpx11(tripToGpx(trip, names)).tracks[0].points[1]).toEqual({ lat: 0, lon: -180 });
  });

  it("writes very small numbers as plain decimals, which GPX requires (no 1e-7)", () => {
    const trip: Trip = {
      name: "Tiny",
      points: [{ lat: 0.0000001, lng: -0.0000002 }, B],
      legs: [{ mode: "hike", route: { status: "routed", geometry: [{ lat: 0.0000001, lng: -0.0000002, elevation: 0.000001 }, { ...B, elevation: 1 }] } }],
    };
    const text = tripToGpx(trip, names);
    expect(text).not.toMatch(/\de-?\d/i);
    expect(parseGpx11(text).tracks[0].points[0]).toEqual({ lat: 0.0000001, lon: -0.0000002, ele: 0 });
  });
});

describe("GPX file name", () => {
  it("is named after the trip, ending in .gpx", () => {
    expect(gpxFileName(ourthe, "Untitled trip")).toBe("Ourthe weekend.gpx");
  });

  it("uses the untitled name for a trip without a name", () => {
    expect(gpxFileName(emptyTrip(), "Untitled trip")).toBe("Untitled trip.gpx");
    expect(gpxFileName({ ...emptyTrip(), name: "  " }, "Untitled trip")).toBe("Untitled trip.gpx");
  });

  it("replaces characters that file systems do not allow, like the save file", () => {
    expect(gpxFileName({ ...emptyTrip(), name: "Lesse / Ourthe: day 1?" }, "Untitled trip")).toBe("Lesse - Ourthe- day 1-.gpx");
  });
});
