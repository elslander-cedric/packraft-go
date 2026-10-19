// Acceptance tests for #8 (camps and per-day totals), written by the tester from
// the issue, spec #2 (stories 20-24, 30) and ADRs 0008 / 0009 before reading the
// diff. Seam 1: the trip planner core, with a fake router (never the network).
import { describe, expect, it } from "vitest";
import type { LegRoute } from "./router";
import { createAutoRouter } from "./routing";
import { routingInto } from "./testing/routingDispatch";
import { parseTrip, restoreTrip, serialiseTrip } from "./saveFile";
import { summarise } from "./summarise";
import { createFakeRouter } from "./testing/fakeRouter";
import {
  applyEdit,
  canUndo,
  emptyTrip,
  isCamp,
  type Edit,
  type LatLng,
  type Leg,
  type Trip,
} from "./trip";

const KM_PER_DEGREE = (6371.0088 * Math.PI) / 180;
const atKm = (km: number): LatLng => ({ lat: 0, lng: km / KM_PER_DEGREE });

const camp = (index: number): Edit => ({ type: "toggleCamp", index });
const undo: Edit = { type: "undo" };
const campsOf = (trip: Trip) =>
  trip.points.map((_, i) => i).filter((i) => isCamp(trip, i));
const edits = (trip: Trip, ...list: Edit[]) => list.reduce(applyEdit, trip);
const through = (...points: LatLng[]) =>
  points.reduce((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());

const routed = (
  from: LatLng,
  to: LatLng,
  elevations: [number, number],
  climbM?: number,
): LegRoute => ({
  status: "routed",
  geometry: [
    { ...from, elevation: elevations[0] },
    { ...to, elevation: elevations[1] },
  ],
  ...(climbM !== undefined && { climbM }),
});

/**
 * Five routed legs, 0-1-2-3-4-5 at km 0, 5, 9, 15, 18, 30.
 * hike 5 km (climb 120 m, 100 -> 50 m), paddle 4 km, hike 6 km (climb 300 m, flat),
 * paddle 3 km, hike 12 km (climb 0, 50 -> 20 m). Default settings: pace 1, 5 km/h.
 */
function fiveLegTrip(): Trip {
  const km = [0, 5, 9, 15, 18, 30];
  const points = km.map(atKm);
  const legs: Leg[] = [
    { mode: "hike", route: routed(points[0], points[1], [100, 50], 120) },
    { mode: "paddle", route: routed(points[1], points[2], [50, 45]) },
    { mode: "hike", route: routed(points[2], points[3], [45, 45], 300) },
    { mode: "paddle", route: routed(points[3], points[4], [45, 50]) },
    { mode: "hike", route: routed(points[4], points[5], [50, 20], 0) },
  ];
  return { name: "Five legs", points, legs };
}

const ranges = (trip: Trip) =>
  summarise(trip).days.map((d) => [d.firstLeg, d.lastLeg]);

describe("AC1/AC4: toggling a camp", () => {
  it("any point can be marked and unmarked, including the start and the end", () => {
    const trip = fiveLegTrip();
    for (const i of [0, 2, 5]) {
      const marked = applyEdit(trip, camp(i));
      expect(isCamp(marked, i)).toBe(true);
      expect(isCamp(applyEdit(marked, camp(i)), i)).toBe(false);
    }
  });

  it("changes no point and no leg: every route is kept", () => {
    const trip = fiveLegTrip();
    const marked = edits(trip, camp(1), camp(3));
    expect(marked.points).toEqual(trip.points);
    expect(marked.legs).toEqual(trip.legs);
  });

  it("makes no routing request on an already routed trip", async () => {
    const router = createFakeRouter({});
    const state = { trip: edits(fiveLegTrip(), camp(2), camp(4), camp(2)) };
    await createAutoRouter(
      router,
      routingInto((change) => (state.trip = change(state.trip))),
    ).sync(state.trip);
    expect(router.calls).toEqual([]);
  });

  it("is undoable, one toggle per undo, and undo after unmarking brings the camp back", () => {
    const start = fiveLegTrip();
    const once = applyEdit(start, camp(2));
    expect(canUndo(once)).toBe(true);
    expect(campsOf(applyEdit(once, undo))).toEqual([]);
    const twice = edits(start, camp(2), camp(3), camp(2));
    expect(campsOf(twice)).toEqual([3]);
    expect(campsOf(applyEdit(twice, undo))).toEqual([2, 3]);
    expect(campsOf(edits(twice, undo, undo))).toEqual([2]);
    expect(campsOf(edits(twice, undo, undo, undo))).toEqual([]);
  });

  it("undo of a camp keeps every route, so nothing is routed again", async () => {
    const trip = fiveLegTrip();
    const undone = edits(trip, camp(2), undo);
    expect(undone.legs).toEqual(trip.legs);
    const router = createFakeRouter({});
    await createAutoRouter(router, () => {}).sync(undone);
    expect(router.calls).toEqual([]);
  });

  it("a point that does not exist cannot be a camp", () => {
    const trip = fiveLegTrip();
    expect(campsOf(applyEdit(trip, camp(6)))).toEqual([]);
    expect(campsOf(applyEdit(trip, camp(-1)))).toEqual([]);
    expect(campsOf(applyEdit(emptyTrip(), camp(0)))).toEqual([]);
  });

  it("a camp stays on its place when an earlier point is deleted, and goes when its own point is", () => {
    const trip = edits(fiveLegTrip(), camp(2), camp(4));
    const deletedEarlier = applyEdit(trip, { type: "deletePoint", index: 1 });
    expect(campsOf(deletedEarlier)).toEqual([1, 3]);
    expect(deletedEarlier.points[1]).toEqual(trip.points[2]);
    expect(campsOf(applyEdit(trip, { type: "deletePoint", index: 2 }))).toEqual(
      [3],
    );
    expect(campsOf(applyEdit(trip, { type: "deletePoint", index: 5 }))).toEqual(
      [2, 4],
    );
  });
});

describe("AC2/AC5: days derived from camps", () => {
  it("no camps is one day covering every leg", () => {
    expect(ranges(fiveLegTrip())).toEqual([[0, 4]]);
  });

  it("a single-leg trip is one day; an empty or one-point trip has no legs to split", () => {
    expect(ranges(through(atKm(0), atKm(3)))).toEqual([[0, 0]]);
    expect(ranges(emptyTrip())).toEqual([]);
    expect(ranges(through(atKm(0)))).toEqual([]);
  });

  it("each camp between start and end starts a new day at its point", () => {
    expect(ranges(edits(fiveLegTrip(), camp(2)))).toEqual([
      [0, 1],
      [2, 4],
    ]);
    expect(ranges(edits(fiveLegTrip(), camp(4), camp(1)))).toEqual([
      [0, 0],
      [1, 3],
      [4, 4],
    ]);
  });

  it("camps on neighbouring points give a one-leg day between them", () => {
    expect(ranges(edits(fiveLegTrip(), camp(2), camp(3)))).toEqual([
      [0, 1],
      [2, 2],
      [3, 4],
    ]);
  });

  it("a camp on every middle point gives one day per leg", () => {
    expect(
      ranges(edits(fiveLegTrip(), camp(1), camp(2), camp(3), camp(4))),
    ).toHaveLength(5);
  });

  it("camps on the start point or the end point add no day (and no empty day)", () => {
    expect(ranges(edits(fiveLegTrip(), camp(0)))).toEqual([[0, 4]]);
    expect(ranges(edits(fiveLegTrip(), camp(5)))).toEqual([[0, 4]]);
    expect(ranges(edits(fiveLegTrip(), camp(0), camp(5), camp(3)))).toEqual([
      [0, 2],
      [3, 4],
    ]);
    expect(ranges(edits(through(atKm(0), atKm(3)), camp(0), camp(1)))).toEqual([
      [0, 0],
    ]);
  });

  it("days follow edits: deleting the start point moves a camp onto the new start, which then splits nothing", () => {
    const trip = applyEdit(edits(fiveLegTrip(), camp(1)), {
      type: "deletePoint",
      index: 0,
    });
    expect(ranges(trip)).toEqual([[0, 3]]);
  });

  it("days are never stored: the trip carries no day figures", () => {
    const saved = JSON.parse(serialiseTrip(edits(fiveLegTrip(), camp(2))));
    expect(JSON.stringify(saved)).not.toMatch(/day|timeH|distanceKm/i);
  });
});

describe("AC3/AC5: per-day totals", () => {
  it("each day sums its own legs: hike distance, paddle distance, climb, descent and time", () => {
    const [d1, d2, d3] = summarise(edits(fiveLegTrip(), camp(2), camp(4))).days;
    // Day 1: hike 5 km (climb 120, descent 50 - 5 m buffer = 45), paddle 4 km.
    expect(d1.hikeDistanceKm).toBeCloseTo(5, 6);
    expect(d1.paddleDistanceKm).toBeCloseTo(4, 6);
    expect(d1.climbM).toBeCloseTo(120, 6);
    expect(d1.descentM).toBeCloseTo(45, 6);
    // 5/5 + 120/600 = 1.2 h hiking, 4/5 = 0.8 h paddling.
    expect(d1.timeH).toBeCloseTo(2.0, 6);
    // Day 2: hike 6 km climb 300 m flat (1.2 + 0.5 = 1.7 h), paddle 3 km (0.6 h); paddle legs add no climb.
    expect(d2.hikeDistanceKm).toBeCloseTo(6, 6);
    expect(d2.paddleDistanceKm).toBeCloseTo(3, 6);
    expect(d2.climbM).toBeCloseTo(300, 6);
    expect(d2.descentM).toBeCloseTo(0, 6);
    expect(d2.timeH).toBeCloseTo(2.3, 6);
    // Day 3: hike only, 12 km, no climb, 30 m down (25 after buffer): 2.4 h.
    expect(d3.hikeDistanceKm).toBeCloseTo(12, 6);
    expect(d3.paddleDistanceKm).toBe(0);
    expect(d3.climbM).toBeCloseTo(0, 6);
    expect(d3.descentM).toBeCloseTo(25, 6);
    expect(d3.timeH).toBeCloseTo(2.4, 6);
  });

  it("day totals add up to the leg figures and the trip totals", () => {
    const summary = summarise(edits(fiveLegTrip(), camp(1), camp(3)));
    const sum = (f: (d: (typeof summary.days)[number]) => number) =>
      summary.days.reduce((t, d) => t + f(d), 0);
    expect(sum((d) => d.hikeDistanceKm + d.paddleDistanceKm)).toBeCloseTo(
      summary.trip.distanceKm,
      9,
    );
    expect(sum((d) => d.timeH)).toBeCloseTo(summary.trip.timeH, 9);
    expect(sum((d) => d.climbM)).toBeCloseTo(
      summary.legs.reduce((t, l) => t + (l.climbM ?? 0), 0),
      9,
    );
  });

  it("day times follow the pace factor and paddling speed", () => {
    const [d1] = summarise(edits(fiveLegTrip(), camp(2)), {
      paceFactor: 1.5,
      paddleSpeedKmh: 4,
    }).days;
    expect(d1.timeH).toBeCloseTo(1.2 * 1.5 + 4 / 4, 6);
  });
});

describe("AC3: day time status follows the trip total rule (ADR 0009)", () => {
  const twoDays = () => edits(fiveLegTrip(), camp(2));
  const withLeg = (trip: Trip, i: number, leg: Leg): Trip => ({
    ...trip,
    legs: trip.legs.with(i, leg),
  });
  const FAILED: LegRoute = {
    status: "failed",
    failure: { kind: "unavailable" },
  };

  it("a fully routed day is an estimate", () => {
    expect(summarise(twoDays()).days.map((d) => d.timeStatus)).toEqual([
      "estimated",
      "estimated",
    ]);
  });

  it("a day waits ('…') while any of its legs, hike or paddle, is unrouted or pending; other days don't", () => {
    for (const leg of [
      { mode: "paddle" } as Leg,
      { mode: "paddle", route: { status: "pending" } } as Leg,
    ]) {
      const { days, trip } = summarise(withLeg(twoDays(), 1, leg));
      expect(days.map((d) => d.timeStatus)).toEqual(["pending", "estimated"]);
      expect(trip.timeStatus).toBe("pending");
    }
  });

  it("a day with a failed hike leg is marked no-climb-data and counts the straight line at flat pace", () => {
    const { days } = summarise(
      withLeg(twoDays(), 2, { mode: "hike", route: FAILED }),
    );
    expect(days.map((d) => d.timeStatus)).toEqual([
      "estimated",
      "no-climb-data",
    ]);
    // Legs 3-5: failed hike 6 km at 5 km/h (no climb) + paddle 3 km at 5 km/h + hike 12 km flat.
    expect(days[1].timeH).toBeCloseTo(1.2 + 0.6 + 2.4, 6);
  });

  it("a failed paddle leg does not mark its day: paddle time needs no climb", () => {
    const { days } = summarise(
      withLeg(twoDays(), 1, { mode: "paddle", route: FAILED }),
    );
    expect(days[0].timeStatus).toBe("estimated");
  });

  it("pending wins over no-climb-data within a day", () => {
    let trip = withLeg(twoDays(), 2, { mode: "hike", route: FAILED });
    trip = withLeg(trip, 3, { mode: "paddle" });
    expect(summarise(trip).days[1].timeStatus).toBe("pending");
  });
});

describe("camps persist in the save format", () => {
  it("save -> open keeps the camps and the same days", () => {
    const trip = edits(fiveLegTrip(), camp(0), camp(2), camp(4));
    const parsed = parseTrip(serialiseTrip(trip));
    if (!parsed.ok) throw new Error("did not parse");
    expect(campsOf(parsed.trip)).toEqual([0, 2, 4]);
    expect(summarise(parsed.trip).days).toEqual(summarise(trip).days);
    expect(campsOf(restoreTrip(serialiseTrip(trip)))).toEqual([0, 2, 4]);
  });

  // Updated: v1 dropped (#33). A version 1 save used to open as a trip without camps.
  // Updated: format reset (#52). Version 1 is current again; the old version 2 is refused.
  it("an old version 2 save is refused as an unknown version", () => {
    const older = JSON.stringify({
      format: "packraft-go-trip",
      version: 2,
      trip: {
        name: "Old",
        points: [
          { lat: 50.3, lng: 5.6 },
          { lat: 50.31, lng: 5.61 },
        ],
        legs: [{ mode: "hike" }],
      },
    });
    expect(parseTrip(older)).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("a save with camps on missing points is refused as a whole, not half-loaded", () => {
    const text = serialiseTrip(edits(fiveLegTrip(), camp(2)));
    const bad = text.replace('"camps":[2]', '"camps":[2,9]');
    expect(bad).not.toBe(text);
    expect(parseTrip(bad)).toEqual({ ok: false });
  });

  it("the restored trip has no undo history: camps are part of the trip, not of the history", () => {
    const parsed = parseTrip(serialiseTrip(edits(fiveLegTrip(), camp(2))));
    if (!parsed.ok) throw new Error("did not parse");
    expect(canUndo(parsed.trip)).toBe(false);
  });
});
