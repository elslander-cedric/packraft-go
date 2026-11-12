// #156: your access points split by the trip's route, for the planner's Access points tab.
import { describe, expect, it } from "vitest";
import { addAccessPoint, type AccessPoints } from "./accessPoints";
import { projectOntoLine } from "./geo";
import type { OfficialAire } from "./officialAire";
import { accessPointsByRoute, mergeInRouteOrder, officialAiresOnRoute } from "./onRoute";
import type { LatLng, LegMode, Trip } from "./trip";

const TIMESTAMP = "2026-10-28T08:00:00.000Z";
// Near Hotton. 0.001 degrees of latitude is about 111 m; 0.001 of longitude about 71 m here.
const start: LatLng = { lat: 50.27, lng: 5.44 };
const north = (point: LatLng, degrees: number): LatLng => ({ lat: point.lat + degrees, lng: point.lng });
const east = (point: LatLng, degrees: number): LatLng => ({ lat: point.lat, lng: point.lng + degrees });

/** A trip due north from `start`: 0.02 degrees (about 2.2 km) per leg. */
const trip = (...modes: LegMode[]): Trip => ({
  name: "",
  points: [start, ...modes.map((_, i) => north(start, 0.02 * (i + 1)))],
  legs: modes.map((mode) => ({ mode })),
});

const points = (...at: [id: string, at: LatLng][]): AccessPoints =>
  at.reduce<AccessPoints>((all, [id, position]) => addAccessPoint(all, { id, at: position, now: TIMESTAMP }), []);

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
      legs: [
        {
          mode: "paddle",
          route: {
            status: "routed",
            geometry: [start, bend, north(start, 0.02)].map((point) => ({ ...point, elevation: 0 })),
          },
        },
      ],
    };
    const all = points(["on-bend", bend], ["on-straight", north(start, 0.01)]);
    const split = accessPointsByRoute(routed, all, null);
    expect(ids(split.onRoute)).toEqual(["on-bend"]);
    expect(ids(split.notOnRoute)).toEqual(["on-straight"]);
  });

  it("marks the access point the trip's put-in or take-out is at", () => {
    const all = points(["put", north(start, 0.02)], ["take", north(start, 0.04)], ["between", north(start, 0.03)]);
    const split = accessPointsByRoute(trip("hike", "paddle"), all, null);
    expect(split.onRoute.map((onRoute) => [onRoute.point.id, onRoute.role])).toEqual([
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
    expect(split.notOnRoute.every((notOnRoute) => notOnRoute.fromYouKm === null)).toBe(true);
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

describe("official aires on the route (#208)", () => {
  const aire = (id: string, { lat, lng }: LatLng): OfficialAire => ({
    id,
    number: 1,
    name: id,
    use: "both",
    officialStretch: "LESSE1-2",
    // [longitude, latitude], unlike a trip's points.
    position: [lng, lat],
    lastChanged: "2016-05-02",
    source: { title: "SPW", url: "https://kayak.spw.wallonie.be/" },
    snapshot: "2026-11-02",
  });
  const aireIds = (list: readonly { aire: { id: string } }[]) => list.map((entry) => entry.aire.id);

  it("keeps only the aires within 200 m of the route, in route order", () => {
    const aires = [
      aire("late", east(north(start, 0.03), 0.002)), // about 140 m off, on leg 2
      aire("off", east(north(start, 0.01), 0.004)), // about 285 m off
      aire("early", east(north(start, 0.005), -0.001)), // about 70 m off, on leg 1
    ];
    const onRoute = officialAiresOnRoute(trip("hike", "paddle"), aires);
    expect(aireIds(onRoute)).toEqual(["early", "late"]);
    expect(onRoute[0].alongKm).toBeCloseTo(0.56, 1);
    expect(onRoute[1].alongKm).toBeCloseTo(3.34, 1);
  });

  it("marks the aire the trip's put-in or take-out is at", () => {
    const aires = [
      aire("put", north(start, 0.02)),
      aire("between", north(start, 0.03)),
      aire("take", north(start, 0.04)),
    ];
    expect(
      officialAiresOnRoute(trip("hike", "paddle"), aires).map((onRouteAire) => [onRouteAire.aire.id, onRouteAire.role]),
    ).toEqual([
      ["put", "put-in"],
      ["between", null],
      ["take", "take-out"],
    ]);
  });

  it("lists none without a route", () => {
    expect(officialAiresOnRoute({ name: "", points: [start], legs: [] }, [aire("a", start)])).toEqual([]);
  });

  it("merges into your on-route points in route order, your point first at the same spot", () => {
    const all = points(["yours-1", north(start, 0.01)], ["yours-2", north(start, 0.03)]);
    const aires = [aire("aire-2", north(start, 0.03)), aire("aire-1", north(start, 0.02))];
    const aTrip = trip("paddle", "paddle");
    const merged = mergeInRouteOrder(accessPointsByRoute(aTrip, all, null).onRoute, officialAiresOnRoute(aTrip, aires));
    expect(merged.map((stop) => ("aire" in stop ? stop.aire.id : stop.point.id))).toEqual([
      "yours-1",
      "aire-1",
      "yours-2",
      "aire-2",
    ]);
  });
});
