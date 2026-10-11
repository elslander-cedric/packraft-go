// Save format (#9): trip ⇄ versioned JSON, including routed results.
import { describe, expect, it } from "vitest";
import { parseTrip, restoreTrip, serialiseTrip } from "./saveFile";
import { applyEdit, canUndo, emptyTrip, type Trip } from "./trip";

const routedTrip: Trip = {
  name: "Ourthe weekend",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
    { lat: 50.32, lng: 5.62 },
  ],
  legs: [
    {
      mode: "hike",
      route: {
        status: "routed",
        geometry: [
          { lat: 50.3, lng: 5.6, elevation: 120 },
          { lat: 50.305, lng: 5.605, elevation: 180.5 },
          { lat: 50.31, lng: 5.61, elevation: 150 },
        ],
        climbM: 100,
      },
    },
    { mode: "paddle", route: { status: "failed", failure: { kind: "no-route" } } },
  ],
};

describe("save format round-trip", () => {
  it("a parsed save gives back the same trip, with routed results and modes", () => {
    const parsed = parseTrip(serialiseTrip(routedTrip));
    expect(parsed).toEqual({ ok: true, trip: routedTrip });
  });

  it("is versioned JSON", () => {
    expect(JSON.parse(serialiseTrip(routedTrip))).toMatchObject({ format: "packraft-go-trip", version: 1 });
  });

  it("does not save undo history: a restored trip has nothing to undo", () => {
    const edited = [
      { type: "addPoint", at: { lat: 50, lng: 4 } },
      { type: "addPoint", at: { lat: 50.1, lng: 4.1 } },
    ] as const;
    const trip = edited.reduce<Trip>(applyEdit, emptyTrip());
    expect(canUndo(trip)).toBe(true);

    expect(serialiseTrip(trip)).not.toContain("undo");
    const parsed = parseTrip(serialiseTrip(trip));
    expect(parsed).toEqual({ ok: true, trip: { name: "", points: trip.points, legs: [{ mode: "hike" }] } });
  });

  it("saves a pending leg without a route, so it is routed again after a restore", () => {
    const trip: Trip = { ...routedTrip, legs: [routedTrip.legs[0], { mode: "paddle", route: { status: "pending" } }] };
    expect(parseTrip(serialiseTrip(trip))).toEqual({
      ok: true,
      trip: { ...routedTrip, legs: [routedTrip.legs[0], { mode: "paddle" }] },
    });
  });

  it("keeps a routed leg without a climb from the router as it is", () => {
    const geometry = [
      { lat: 50, lng: 4, elevation: 10 },
      { lat: 50.1, lng: 4.1, elevation: 20 },
    ];
    const trip: Trip = {
      name: "No climb",
      points: [
        { lat: 50, lng: 4 },
        { lat: 50.1, lng: 4.1 },
      ],
      legs: [{ mode: "hike", route: { status: "routed", geometry } }],
    };
    expect(parseTrip(serialiseTrip(trip))).toEqual({ ok: true, trip });
  });
});

describe("restoring the stored trip", () => {
  it("restores a saved trip", () => {
    expect(restoreTrip(serialiseTrip(routedTrip))).toEqual(routedTrip);
  });

  it("gives an empty trip when nothing is stored", () => {
    expect(restoreTrip(null)).toEqual(emptyTrip());
  });

  it("gives an empty trip when the stored data is unreadable", () => {
    expect(restoreTrip('{"format":"packraft-go-trip","version":1,"trip":{"name":"x","points":[{}]')).toEqual(
      emptyTrip(),
    );
  });
});

describe("parsing invalid input", () => {
  const valid = JSON.parse(serialiseTrip(routedTrip));
  const withTrip = (trip: object) => JSON.stringify({ ...valid, trip: { ...valid.trip, ...trip } });
  const withLeg = (leg: object) => withTrip({ legs: [leg, valid.trip.legs[1]] });
  const withFirstPoint = (point: object) => withTrip({ points: [point, ...valid.trip.points.slice(1)] });

  it.each([
    ["empty text", ""],
    ["text that is not JSON", "{not json"],
    ["JSON that is not an object", "[1, 2]"],
    ["null", "null"],
    ["another app's file", JSON.stringify({ ...valid, format: "something-else" })],
    ["a file from a newer version", JSON.stringify({ ...valid, version: 2 })],
    ["a file without a trip", JSON.stringify({ format: valid.format, version: valid.version })],
    ["a name that is not text", withTrip({ name: 42 })],
    ["points that are not a list", withTrip({ points: {} })],
    ["a point without a longitude", withFirstPoint({ lat: 50 })],
    ["a point with a text latitude", withFirstPoint({ lat: "50", lng: 4 })],
    ["a latitude out of range", withFirstPoint({ lat: 91, lng: 4 })],
    ["more legs than points allow", withTrip({ legs: [...valid.trip.legs, { mode: "hike" }] })],
    ["fewer legs than points need", withTrip({ legs: valid.trip.legs.slice(1) })],
    ["an unknown leg mode", withLeg({ mode: "swim" })],
    ["an unknown route status", withLeg({ mode: "hike", route: { status: "teleported" } })],
    ["a routed leg without geometry", withLeg({ mode: "hike", route: { status: "routed" } })],
    [
      "a routed point without elevation",
      withLeg({ mode: "hike", route: { status: "routed", geometry: [{ lat: 50, lng: 4 }] } }),
    ],
    ["a climb that is not a number", withLeg({ mode: "hike", route: { status: "routed", geometry: [], climbM: "100" } })],
    ["an unknown failure kind", withLeg({ mode: "hike", route: { status: "failed", failure: { kind: "boom" } } })],
  ])("rejects %s", (_, text) => {
    expect(parseTrip(text)).toEqual({ ok: false });
  });

  it("accepts an empty trip and a trip with only a start point", () => {
    const start = { name: "", points: [{ lat: 50, lng: 4 }], legs: [] };
    expect(parseTrip(serialiseTrip(emptyTrip()))).toEqual({ ok: true, trip: emptyTrip() });
    expect(parseTrip(serialiseTrip(start))).toEqual({ ok: true, trip: start });
  });

  it("ignores fields it does not know, so they do not leak into the trip", () => {
    const text = withTrip({ undoSteps: [], extra: true, points: [{ lat: 50.3, lng: 5.6, x: 1 }, ...valid.trip.points.slice(1)] });
    expect(parseTrip(text)).toEqual({ ok: true, trip: routedTrip });
  });
});
