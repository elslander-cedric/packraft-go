// Time estimates (ADR 0009): Naismith for hike legs, the planner's speed for paddle legs.
import { describe, expect, it } from "vitest";
import type { RoutedPoint } from "./router";
import { defaultSettings } from "./settings";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type LatLng, type LegMode, type Trip } from "./trip";

// One degree of arc on a sphere with the Earth's mean radius (6371.0088 km).
const KM_PER_DEGREE = (6371.0088 * Math.PI) / 180;

const tripThrough = (...points: LatLng[]) =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

/** A routed leg along the equator of `km` kilometres, with the router's climb. */
function routedLeg(mode: LegMode, km: number, climbM?: number): Trip {
  const geometry: RoutedPoint[] = [
    { lat: 0, lng: 0, elevation: 100 },
    { lat: 0, lng: km / KM_PER_DEGREE, elevation: 100 },
  ];
  return {
    ...tripThrough(geometry[0], geometry[1]),
    legs: [{ mode, route: { status: "routed", geometry, climbM } }],
  };
}

describe("hike time (Naismith)", () => {
  it("10 km with 600 m climb at pace 1.0 takes 3 h", () => {
    const leg = summarise(routedLeg("hike", 10, 600)).legs[0];
    expect(leg.timeH).toBeCloseTo(3, 6);
  });

  it("defaults to pace factor 1.0", () => {
    expect(defaultSettings.paceFactor).toBe(1);
    const withDefaults = summarise(routedLeg("hike", 10, 600), defaultSettings).legs[0];
    expect(withDefaults.timeH).toBeCloseTo(3, 6);
  });

  it("flat ground goes at 5 km/h", () => {
    expect(summarise(routedLeg("hike", 7.5, 0)).legs[0].timeH).toBeCloseTo(1.5, 6);
  });

  it("uses the smoothed climb on the routed leg", () => {
    expect(summarise(routedLeg("hike", 5, 300)).legs[0].timeH).toBeCloseTo(1.5, 6);
  });

  it("scales by the pace factor", () => {
    const leg = summarise(routedLeg("hike", 10, 600), { ...defaultSettings, paceFactor: 1.5 }).legs[0];
    expect(leg.timeH).toBeCloseTo(4.5, 6);
    const fast = summarise(routedLeg("hike", 10, 600), { ...defaultSettings, paceFactor: 0.8 }).legs[0];
    expect(fast.timeH).toBeCloseTo(2.4, 6);
  });

  it("the paddling speed does not change hike time", () => {
    const leg = summarise(routedLeg("hike", 10, 600), { ...defaultSettings, paddleSpeedKmh: 2 }).legs[0];
    expect(leg.timeH).toBeCloseTo(3, 6);
  });

  it("a routed hike leg has an estimated time", () => {
    expect(summarise(routedLeg("hike", 10, 600)).legs[0].timeStatus).toBe("estimated");
  });

  // Updated in round 2: a hike leg still being snapped has no time yet (it used to be timed without climb).
  it("a hike leg that is not routed yet (no route or pending) has a pending time", () => {
    const trip = tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 10 / KM_PER_DEGREE });
    expect(summarise(trip).legs[0].timeStatus).toBe("pending");
    const pending: Trip = { ...trip, legs: [{ mode: "hike", route: { status: "pending" } }] };
    expect(summarise(pending).legs[0].timeStatus).toBe("pending");
  });

  it("a hike leg that failed to route is timed on its straight-line distance, marked as having no climb data", () => {
    const trip = tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 10 / KM_PER_DEGREE });
    const failed: Trip = {
      ...trip,
      legs: [{ mode: "hike", route: { status: "failed", failure: { kind: "unavailable" } } }],
    };
    const leg = summarise(failed, { ...defaultSettings, paceFactor: 1.5 }).legs[0];
    expect(leg.timeH).toBeCloseTo(3, 6);
    expect(leg.timeStatus).toBe("no-climb-data");
  });
});

describe("paddle time (planner's speed)", () => {
  it("defaults to 5 km/h", () => {
    expect(defaultSettings.paddleSpeedKmh).toBe(5);
    expect(summarise(routedLeg("paddle", 10)).legs[0].timeH).toBeCloseTo(2, 6);
  });

  it("uses the planner's paddling speed", () => {
    const leg = summarise(routedLeg("paddle", 10), { ...defaultSettings, paddleSpeedKmh: 4 }).legs[0];
    expect(leg.timeH).toBeCloseTo(2.5, 6);
  });

  it("ignores climb and the pace factor", () => {
    const leg = summarise(routedLeg("paddle", 10, 600), { ...defaultSettings, paceFactor: 2 }).legs[0];
    expect(leg.timeH).toBeCloseTo(2, 6);
  });

  it("a paddle leg not routed yet is timed on its straight-line distance", () => {
    const trip: Trip = {
      ...tripThrough({ lat: 0, lng: 0 }, { lat: 0, lng: 10 / KM_PER_DEGREE }),
      legs: [{ mode: "paddle" }],
    };
    expect(summarise(trip).legs[0].timeH).toBeCloseTo(2, 6);
    // Paddle time does not depend on climb, so it is an estimate even before routing.
    expect(summarise(trip).legs[0].timeStatus).toBe("estimated");
    const failed: Trip = { ...trip, legs: [{ mode: "paddle", route: { status: "failed", failure: { kind: "no-route" } } }] };
    expect(summarise(failed).legs[0].timeStatus).toBe("estimated");
  });
});

describe("trip time", () => {
  it("an empty trip takes no time", () => {
    expect(summarise(emptyTrip()).trip.timeH).toBe(0);
    expect(summarise(emptyTrip()).trip.timeStatus).toBe("estimated");
  });

  /** A hike leg of 10 km + 600 m (3 h) followed by a second leg in the given state. */
  const withSecondLeg = (second: Trip["legs"][number]): Trip => {
    const hike = routedLeg("hike", 10, 600);
    return { ...hike, points: [...hike.points, { lat: 0, lng: 20 / KM_PER_DEGREE }], legs: [hike.legs[0], second] };
  };

  it("is pending while any leg is pending, whatever its mode", () => {
    expect(summarise(withSecondLeg({ mode: "hike" })).trip.timeStatus).toBe("pending");
    expect(summarise(withSecondLeg({ mode: "paddle", route: { status: "pending" } })).trip.timeStatus).toBe(
      "pending",
    );
  });

  it("includes a failed hike leg's distance-only time and is marked as having no climb data", () => {
    const summary = summarise(withSecondLeg({ mode: "hike", route: { status: "failed", failure: { kind: "no-route" } } }));
    expect(summary.trip.timeH).toBeCloseTo(5, 6);
    expect(summary.trip.timeStatus).toBe("no-climb-data");
  });

  it("a failed paddle leg leaves the trip time an estimate", () => {
    const summary = summarise(withSecondLeg({ mode: "paddle", route: { status: "failed", failure: { kind: "no-route" } } }));
    expect(summary.trip.timeH).toBeCloseTo(5, 6);
    expect(summary.trip.timeStatus).toBe("estimated");
  });

  it("is the sum of the legs' times, and follows settings changes", () => {
    const hike = routedLeg("hike", 10, 600);
    const trip: Trip = {
      name: "",
      points: [...hike.points, { lat: 0, lng: 20 / KM_PER_DEGREE }],
      legs: [
        hike.legs[0],
        {
          mode: "paddle",
          route: {
            status: "routed",
            geometry: [
              { lat: 0, lng: 10 / KM_PER_DEGREE, elevation: 100 },
              { lat: 0, lng: 20 / KM_PER_DEGREE, elevation: 90 },
            ],
          },
        },
      ],
    };
    expect(summarise(trip).trip.timeH).toBeCloseTo(5, 6);
    expect(summarise(trip, { paceFactor: 2, paddleSpeedKmh: 10 }).trip.timeH).toBeCloseTo(7, 6);
  });
});
