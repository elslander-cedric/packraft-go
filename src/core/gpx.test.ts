// GPX export (#11, ADR 0006): the trip as a GPX 1.1 file, one track per leg, camps as waypoints.
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { tripToGpx, type GpxNames } from "./gpx";
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
});
