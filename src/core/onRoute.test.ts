// #156: your access points split by the trip's route, for the planner's Access points tab.
import { describe, expect, it } from "vitest";
import { addAccessPoint, type AccessPoints } from "./accessPoints";
import { projectOntoLine } from "./geo";
import { accessPointsByRoute } from "./onRoute";
import type { LatLng, LegMode, Trip } from "./trip";

const T = "2026-10-28T08:00:00.000Z";
// Near Hotton. 0.001 degrees of latitude is about 111 m; 0.001 of longitude about 71 m here.
const start: LatLng = { lat: 50.27, lng: 5.44 };
const north = (p: LatLng, degrees: number): LatLng => ({ lat: p.lat + degrees, lng: p.lng });
const east = (p: LatLng, degrees: number): LatLng => ({ lat: p.lat, lng: p.lng + degrees });

/** A trip due north from `start`: 0.02 degrees (about 2.2 km) per leg. */
const trip = (...modes: LegMode[]): Trip => ({
  name: "",
  points: [start, ...modes.map((_, i) => north(start, 0.02 * (i + 1)))],
  legs: modes.map((mode) => ({ mode })),
});

const points = (...at: [id: string, at: LatLng][]): AccessPoints =>
  at.reduce<AccessPoints>((all, [id, position]) => addAccessPoint(all, { id, at: position, now: T }), []);

const ids = (list: readonly { point: { id: string } }[]) => list.map((entry) => entry.point.id);

describe("projectOntoLine", () => {
  it("gives the distance from the line and how far along it the nearest spot is", () => {
    const line = [start, north(start, 0.01), east(north(start, 0.01), 0.01)];
    const { offM, alongM } = projectOntoLine(east(north(start, 0.005), 0.001), line);
    expect(offM).toBeCloseTo(71, 0);
    expect(alongM).toBeCloseTo(556, -1);
    // Past the corner, along the second segment.
    expect(projectOntoLine(north(east(north(start, 0.01), 0.005), 0.001), line).alongM).toBeCloseTo(1112 + 357, -1);
  });
});

describe("accessPointsByRoute", () => {
  it("puts points within 200 m of the route on it, in route order", () => {
    const all = points(
      ["late", east(north(start, 0.03), 0.002)], // about 140 m off, on leg 2
      ["early", east(north(start, 0.005), -0.001)], // about 70 m off, on leg 1
      ["off", east(north(start, 0.01), 0.004)], // about 285 m off
    );
    const split = accessPointsByRoute(trip("hike", "paddle"), all, null);
    expect(split.hasRoute).toBe(true);
    expect(ids(split.onRoute)).toEqual(["early", "late"]);
    expect(split.onRoute[0].alongKm).toBeCloseTo(0.56, 1);
    expect(split.onRoute[1].alongKm).toBeCloseTo(3.34, 1);
    expect(ids(split.notOnRoute)).toEqual(["off"]);
  });

  it("follows a routed leg's geometry, not the straight line between its points", () => {
    const bend = east(north(start, 0.01), 0.01);
    const routed: Trip = {
      ...trip("paddle"),
      legs: [{ mode: "paddle", route: { status: "routed", geometry: [start, bend, north(start, 0.02)].map((p) => ({ ...p, elevation: 0 })) } }],
    };
    const all = points(["on-bend", bend], ["on-straight", north(start, 0.01)]);
    const split = accessPointsByRoute(routed, all, null);
    expect(ids(split.onRoute)).toEqual(["on-bend"]);
    expect(ids(split.notOnRoute)).toEqual(["on-straight"]);
  });

  it("marks the access point the trip's put-in or take-out is at", () => {
    const all = points(["put", north(start, 0.02)], ["take", north(start, 0.04)], ["between", north(start, 0.03)]);
    const split = accessPointsByRoute(trip("hike", "paddle"), all, null);
    expect(split.onRoute.map((o) => [o.point.id, o.role])).toEqual([
      ["put", "put-in"],
      ["between", null],
      ["take", "take-out"],
    ]);
  });

  it("orders the rest nearest to you first, with the distance from you", () => {
    const you = east(start, 0.1);
    const all = points(["far", east(start, -0.05)], ["near", east(start, 0.09)], ["middle", east(start, 0.03)]);
    const split = accessPointsByRoute(trip("hike"), all, you);
    expect(ids(split.notOnRoute)).toEqual(["near", "middle", "far"]);
    expect(split.notOnRoute[0].fromYouKm).toBeCloseTo(0.72, 1);
  });

  it("without your position, orders the rest nearest to the route first", () => {
    const all = points(["far", east(start, -0.05)], ["near", east(start, 0.01)], ["middle", east(start, 0.03)]);
    const split = accessPointsByRoute(trip("hike"), all, null);
    expect(ids(split.notOnRoute)).toEqual(["near", "middle", "far"]);
    expect(split.notOnRoute.every((o) => o.fromYouKm === null)).toBe(true);
  });

  it("without a route, has every point in the rest: nearest to you, or in the order added", () => {
    const all = points(["b", east(start, 0.05)], ["a", east(start, 0.01)]);
    const noRoute: Trip = { name: "", points: [start], legs: [] };
    const split = accessPointsByRoute(noRoute, all, null);
    expect(split.hasRoute).toBe(false);
    expect(split.onRoute).toEqual([]);
    expect(ids(split.notOnRoute)).toEqual(["b", "a"]);
    expect(ids(accessPointsByRoute(noRoute, all, start).notOnRoute)).toEqual(["a", "b"]);
    expect(accessPointsByRoute({ name: "", points: [], legs: [] }, all, null).hasRoute).toBe(false);
  });
});
