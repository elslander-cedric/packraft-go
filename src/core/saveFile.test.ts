// Save format (#9): trip ⇄ versioned JSON, including routed results.
import { describe, expect, it } from "vitest";
import { parseTrip, restoreTrip, saveFileName, serialiseTrip } from "./saveFile";
import { summarise } from "./summarise";
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
    // Updated in round 2 of #8: the save format is now version 2.
    // Updated: format reset (#52). The save format is version 1 again.
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

describe("paddle legs", () => {
  // A hike leg to the put-in, then a routed paddle leg from 110 m down to 103 m.
  const paddleTrip: Trip = {
    name: "Lesse",
    points: [
      { lat: 50.2, lng: 5.0 },
      { lat: 50.21, lng: 5.01 },
      { lat: 50.23, lng: 5.04 },
    ],
    legs: [
      routedTrip.legs[0],
      {
        mode: "paddle",
        route: {
          status: "routed",
          geometry: [
            { lat: 50.21, lng: 5.01, elevation: 110 },
            { lat: 50.22, lng: 5.02, elevation: 111 },
            { lat: 50.23, lng: 5.04, elevation: 103 },
          ],
          climbM: 1,
        },
      },
    ],
  };

  it("restore with their mode and river route, so the drop is the same and nothing needs routing", () => {
    const restored = restoreTrip(serialiseTrip(paddleTrip));
    expect(restored).toEqual(paddleTrip);
    expect(restored.legs.map((leg) => leg.mode)).toEqual(["hike", "paddle"]);
    expect(restored.legs.every((leg) => leg.route?.status === "routed")).toBe(true);
    expect(summarise(restored).legs[1]).toMatchObject({ mode: "paddle", dropM: 7 });
    expect(summarise(restored)).toEqual(summarise(paddleTrip));
  });

  it("a paddle leg switched by setLegMode saves its new mode", () => {
    const switched = applyEdit(routedTrip, { type: "setLegMode", index: 0, mode: "paddle" });
    const restored = restoreTrip(serialiseTrip(switched));
    expect(restored.legs[0]).toEqual({ mode: "paddle" });
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
    // Updated: v1 dropped (#33). Version 2, so this stays about unreadable data, not the version.
    // Updated: format reset (#52). Version 1, the current version.
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

describe("save file name", () => {
  it("is named after the trip", () => {
    expect(saveFileName({ ...emptyTrip(), name: "Ourthe weekend" }, "Untitled trip")).toBe(
      "Ourthe weekend.packraft.json",
    );
  });

  it("uses the given untitled name for a trip without a name", () => {
    expect(saveFileName(emptyTrip(), "Untitled trip")).toBe("Untitled trip.packraft.json");
    expect(saveFileName({ ...emptyTrip(), name: "   " }, "Untitled trip")).toBe("Untitled trip.packraft.json");
  });

  it("replaces characters that file systems do not allow and trims spaces", () => {
    expect(saveFileName({ ...emptyTrip(), name: ' Lesse / Ourthe: day 1-2 <v2>?*"|\\ ' }, "Untitled trip")).toBe(
      "Lesse - Ourthe- day 1-2 -v2-.packraft.json",
    );
  });
});

// Camps (#8): version 2 of the save format includes camps. It is the only version (#33).
// Updated: format reset (#52). The format with camps is now version 1, the only version.
describe("camps in the save format", () => {
  const withCamps: Trip = { ...routedTrip, camps: [1] };
  const valid = JSON.parse(serialiseTrip(routedTrip));
  const withSavedCamps = (camps: unknown) => JSON.stringify({ ...valid, trip: { ...valid.trip, camps } });

  it("a parsed save gives back the trip's camps", () => {
    expect(parseTrip(serialiseTrip(withCamps))).toEqual({ ok: true, trip: withCamps });
  });

  it("restores the same days", () => {
    const parsed = parseTrip(serialiseTrip(withCamps));
    if (!parsed.ok) throw new Error("not parsed");
    expect(summarise(parsed.trip).days).toHaveLength(2);
    expect(summarise(parsed.trip).days).toEqual(summarise(withCamps).days);
  });

  // Updated: format reset (#52).
  it("is saved as version 1, listing the camps when the trip has any", () => {
    expect(JSON.parse(serialiseTrip(withCamps))).toMatchObject({ version: 1, trip: { camps: [1] } });
    const withoutCamps = JSON.parse(serialiseTrip(routedTrip));
    expect(withoutCamps.version).toBe(1);
    expect(withoutCamps.trip).not.toHaveProperty("camps");
  });

  // Updated: v1 dropped (#33). Version 1 used to load as a trip without camps.
  // Updated: format reset (#52). Now the old version 2 is the one refused.
  it("refuses an old version 2 save as an unknown version, like any version other than 1", () => {
    expect(parseTrip(JSON.stringify({ ...valid, version: 2 }))).toEqual({ ok: false, reason: "unknown-version" });
  });

  // Updated: v1 dropped (#33). Updated: format reset (#52).
  it("an old version 2 save gives an empty trip from storage", () => {
    expect(restoreTrip(JSON.stringify({ ...valid, version: 2 }))).toEqual(emptyTrip());
  });

  it.each([0, 3, 99, -1, 1.5])("refuses version %s as a newer or unknown version", (version) => {
    expect(parseTrip(JSON.stringify({ ...valid, version }))).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("an unknown version gives an empty trip from storage, like any unreadable save", () => {
    expect(restoreTrip(JSON.stringify({ ...valid, version: 3 }))).toEqual(emptyTrip());
  });

  it("reads camps in any order as the same camps", () => {
    expect(parseTrip(withSavedCamps([2, 0]))).toEqual({ ok: true, trip: { ...routedTrip, camps: [0, 2] } });
  });

  it("an empty camps list is a trip without camps", () => {
    expect(parseTrip(withSavedCamps([]))).toEqual({ ok: true, trip: routedTrip });
  });

  it.each([
    ["camps that are not a list", { 1: true }],
    ["a camp that is not a number", ["1"]],
    ["a camp that is not a whole number", [0.5]],
    ["a camp on a point that does not exist", [3]],
    ["a negative camp", [-1]],
    ["the same camp twice", [1, 1]],
  ])("rejects %s", (_, camps) => {
    expect(parseTrip(withSavedCamps(camps))).toEqual({ ok: false });
  });
});
