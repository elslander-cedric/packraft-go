// Acceptance tests for #6 (edit the route: drag, delete, undo), written by the
// tester from the issue's acceptance criteria. They use only the core's public
// interface (Seam 1): build a trip with edits, then read the trip and its figures.
import { describe, expect, it } from "vitest";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, type Edit, type LatLng, type Leg, type Trip } from "./trip";

const P = [
  { lat: 50.3527, lng: 5.4561 }, // Durbuy
  { lat: 50.2678, lng: 5.4469 }, // Hotton
  { lat: 50.1833, lng: 5.5756 }, // La Roche
  { lat: 50.1, lng: 5.7 },
  { lat: 50.05, lng: 5.8 },
];
const ELSEWHERE = { lat: 50.4, lng: 5.3 };

const add = (trip: Trip, at: LatLng) => applyEdit(trip, { type: "addPoint", at });
const through = (...points: LatLng[]) => points.reduce(add, emptyTrip());
const move = (index: number, to: LatLng): Edit => ({ type: "movePoint", index, to });
const del = (index: number): Edit => ({ type: "deletePoint", index });
const undo: Edit = { type: "undo" };
const modes = (trip: Trip) => trip.legs.map((leg) => leg.mode);

/**
 * Routed results don't exist on Leg yet (#4). Model one as an extra field on a
 * leg so we can observe which legs an edit keeps and which it clears.
 */
type RoutedLeg = Leg & { routed?: string };
const routedTrip = (points: LatLng[], legModes: Leg["mode"][]): Trip => ({
  ...through(...points),
  legs: legModes.map((mode, i): RoutedLeg => ({ mode, routed: `route-${i}` })),
});
const routed = (trip: Trip) => trip.legs.map((leg) => (leg as RoutedLeg).routed);

describe("AC1: dragging a point moves it and updates the adjacent legs", () => {
  it("a middle point moves; both legs now meet at the new spot", () => {
    const trip = applyEdit(through(P[0], P[1], P[2]), move(1, ELSEWHERE));
    expect(trip.points).toEqual([P[0], ELSEWHERE, P[2]]);
    expect(trip.legs).toHaveLength(2);
    const fresh = summarise(through(P[0], ELSEWHERE, P[2]));
    const s = summarise(trip);
    expect(s.legs.map((l) => l.distanceKm)).toEqual(fresh.legs.map((l) => l.distanceKm));
  });

  it("the start and end points can be moved", () => {
    expect(applyEdit(through(P[0], P[1]), move(0, ELSEWHERE)).points).toEqual([ELSEWHERE, P[1]]);
    expect(applyEdit(through(P[0], P[1]), move(1, ELSEWHERE)).points).toEqual([P[0], ELSEWHERE]);
  });

  it("a single-point trip can move its only point", () => {
    const trip = applyEdit(through(P[0]), move(0, ELSEWHERE));
    expect(trip.points).toEqual([ELSEWHERE]);
    expect(trip.legs).toHaveLength(0);
  });

  it("moving keeps leg modes", () => {
    const trip = applyEdit(routedTrip([P[0], P[1], P[2]], ["paddle", "hike"]), move(1, ELSEWHERE));
    expect(modes(trip)).toEqual(["paddle", "hike"]);
  });

  it("does not change the input trip", () => {
    const before = through(P[0], P[1], P[2]);
    applyEdit(before, move(1, ELSEWHERE));
    expect(before.points).toEqual([P[0], P[1], P[2]]);
  });

  it("moving a point that doesn't exist changes nothing", () => {
    const before = through(P[0], P[1]);
    for (const i of [-1, 2, 99]) {
      const after = applyEdit(before, move(i, ELSEWHERE));
      expect(after.points).toEqual(before.points);
      // No undo step is recorded: undo still reverts the last real edit (adding P1).
      expect(applyEdit(after, undo).points).toEqual([P[0]]);
    }
  });
});

describe("AC2: deleting a point", () => {
  it("a middle point: its two legs merge into one leg between the neighbours", () => {
    const trip = applyEdit(through(P[0], P[1], P[2], P[3]), del(1));
    expect(trip.points).toEqual([P[0], P[2], P[3]]);
    expect(trip.legs).toHaveLength(2);
    const s = summarise(trip);
    expect(s.trip.distanceKm).toBeCloseTo(summarise(through(P[0], P[2], P[3])).trip.distanceKm, 9);
  });

  it("the merged leg takes the earlier leg's mode (both orders)", () => {
    expect(modes(applyEdit(routedTrip([P[0], P[1], P[2]], ["paddle", "hike"]), del(1)))).toEqual(["paddle"]);
    expect(modes(applyEdit(routedTrip([P[0], P[1], P[2]], ["hike", "paddle"]), del(1)))).toEqual(["hike"]);
  });

  it("other legs keep their modes when a middle point is deleted", () => {
    const trip = applyEdit(routedTrip(P, ["hike", "paddle", "hike", "paddle"]), del(2));
    expect(modes(trip)).toEqual(["hike", "paddle", "paddle"]);
  });

  it("deleting the start point removes its leg", () => {
    const trip = applyEdit(routedTrip([P[0], P[1], P[2]], ["paddle", "hike"]), del(0));
    expect(trip.points).toEqual([P[1], P[2]]);
    expect(modes(trip)).toEqual(["hike"]);
  });

  it("deleting the end point removes its leg", () => {
    const trip = applyEdit(routedTrip([P[0], P[1], P[2]], ["paddle", "hike"]), del(2));
    expect(trip.points).toEqual([P[0], P[1]]);
    expect(modes(trip)).toEqual(["paddle"]);
  });

  it("deleting from a two-point trip leaves one point and no legs", () => {
    expect(applyEdit(through(P[0], P[1]), del(0))).toMatchObject({ points: [P[1]], legs: [] });
    expect(applyEdit(through(P[0], P[1]), del(1))).toMatchObject({ points: [P[0]], legs: [] });
  });

  it("deleting the only point empties the trip", () => {
    expect(applyEdit(through(P[0]), del(0))).toMatchObject({ points: [], legs: [] });
  });

  it("deleting a point that doesn't exist changes nothing", () => {
    const before = through(P[0], P[1]);
    expect(applyEdit(before, del(5)).points).toEqual(before.points);
    expect(applyEdit(emptyTrip(), del(0)).points).toEqual([]);
  });
});

describe("AC3: undo reverses add, move and delete, repeatedly, back to an empty trip", () => {
  it("undoes a mixed sequence step by step, back to empty", () => {
    const edits: Edit[] = [
      { type: "addPoint", at: P[0] },
      { type: "addPoint", at: P[1] },
      { type: "addPoint", at: P[2] },
      move(1, ELSEWHERE),
      { type: "addPoint", at: P[3] },
      del(2),
      move(0, P[4]),
      del(0),
    ];
    const states: Trip[] = [emptyTrip()];
    for (const e of edits) states.push(applyEdit(states[states.length - 1], e));

    let trip = states[states.length - 1];
    for (let i = states.length - 2; i >= 0; i--) {
      trip = applyEdit(trip, undo);
      expect(trip.points).toEqual(states[i].points);
      expect(modes(trip)).toEqual(modes(states[i]));
    }
    expect(trip.points).toEqual([]);
    expect(trip.legs).toEqual([]);
  });

  it("undo on an empty trip, or with nothing left to undo, is harmless", () => {
    expect(applyEdit(emptyTrip(), undo)).toMatchObject({ points: [], legs: [] });
    let trip = applyEdit(applyEdit(through(P[0]), undo), undo);
    trip = applyEdit(trip, undo);
    expect(trip.points).toEqual([]);
  });

  it("restores a deleted middle point and both original legs with their modes", () => {
    const before = routedTrip([P[0], P[1], P[2]], ["paddle", "hike"]);
    const after = applyEdit(applyEdit(before, del(1)), undo);
    expect(after.points).toEqual(before.points);
    expect(modes(after)).toEqual(["paddle", "hike"]);
  });

  it("new edits after an undo continue normally (no redo, history keeps working)", () => {
    let trip = through(P[0], P[1], P[2]);
    trip = applyEdit(trip, undo); // [P0, P1]
    trip = add(trip, P[3]); // [P0, P1, P3]
    expect(trip.points).toEqual([P[0], P[1], P[3]]);
    trip = applyEdit(trip, undo);
    expect(trip.points).toEqual([P[0], P[1]]);
    trip = applyEdit(applyEdit(trip, undo), undo);
    expect(trip.points).toEqual([]);
  });

  it("a long history (200 edits) undoes all the way back", () => {
    let trip = emptyTrip();
    for (let i = 0; i < 100; i++) trip = add(trip, { lat: 50 + i / 1000, lng: 5 });
    for (let i = 0; i < 100; i++) trip = applyEdit(trip, move(i, { lat: 51, lng: 5 + i / 1000 }));
    for (let i = 0; i < 200; i++) trip = applyEdit(trip, undo);
    expect(trip.points).toEqual([]);
  });
});

describe("AC4: edits clear routed results only for legs they change", () => {
  const five = () => routedTrip(P, ["hike", "paddle", "hike", "paddle"]);

  it("moving a middle point clears just the two legs that touch it", () => {
    expect(routed(applyEdit(five(), move(2, ELSEWHERE)))).toEqual([
      "route-0",
      undefined,
      undefined,
      "route-3",
    ]);
  });

  it("moving the start or end point clears just its one leg", () => {
    expect(routed(applyEdit(five(), move(0, ELSEWHERE)))).toEqual([undefined, "route-1", "route-2", "route-3"]);
    expect(routed(applyEdit(five(), move(4, ELSEWHERE)))).toEqual(["route-0", "route-1", "route-2", undefined]);
  });

  it("deleting a middle point clears only the merged leg", () => {
    expect(routed(applyEdit(five(), del(2)))).toEqual(["route-0", undefined, "route-3"]);
  });

  it("deleting the start or end point keeps every remaining leg's route", () => {
    expect(routed(applyEdit(five(), del(0)))).toEqual(["route-1", "route-2", "route-3"]);
    expect(routed(applyEdit(five(), del(4)))).toEqual(["route-0", "route-1", "route-2"]);
  });

  it("adding a point keeps the existing legs' routes", () => {
    expect(routed(add(five(), ELSEWHERE))).toEqual(["route-0", "route-1", "route-2", "route-3", undefined]);
  });

  it("undo restores the routed results an edit cleared", () => {
    let trip = applyEdit(five(), move(2, ELSEWHERE));
    trip = applyEdit(trip, del(1));
    trip = applyEdit(applyEdit(trip, undo), undo);
    expect(trip.points).toEqual(P);
    expect(routed(trip)).toEqual(["route-0", "route-1", "route-2", "route-3"]);
  });
});
