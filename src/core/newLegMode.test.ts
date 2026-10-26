import { describe, expect, it } from "vitest";
import { applyEdit, emptyTrip, type Trip } from "./trip";
import { firstSession, plannerSession } from "./plannerSession";

const A = { lat: 50.4, lng: 5.5 };
const B = { lat: 50.5, lng: 5.6 };
const C = { lat: 50.6, lng: 5.7 };
const D = { lat: 50.7, lng: 5.8 };

const withTwoPoints = (): Trip => applyEdit(applyEdit(emptyTrip(), { type: "addPoint", at: A }), { type: "addPoint", at: B });
const paddling = (): Trip => applyEdit(withTwoPoints(), { type: "setLegMode", index: 0, mode: "paddle" });

describe("a new leg takes the mode of the last leg", () => {
  it("makes the first leg a hike leg", () => {
    expect(withTwoPoints().legs.map((l) => l.mode)).toEqual(["hike"]);
  });

  it("takes the last leg's mode", () => {
    const trip = applyEdit(paddling(), { type: "addPoint", at: C });
    expect(trip.legs.map((l) => l.mode)).toEqual(["paddle", "paddle"]);
  });

  it("lets an explicit mode win", () => {
    const trip = applyEdit(paddling(), { type: "addPoint", at: C, mode: "hike" });
    expect(trip.legs.map((l) => l.mode)).toEqual(["paddle", "hike"]);
  });

  it("undoes the added point in one step", () => {
    const undone = applyEdit(applyEdit(paddling(), { type: "addPoint", at: C }), { type: "undo" });
    expect(undone.points).toEqual([A, B]);
    expect(undone.legs.map((l) => l.mode)).toEqual(["paddle"]);
  });

  it("works through the session, with and without an explicit mode", () => {
    let s = firstSession({ trip: emptyTrip() });
    s = plannerSession(s, { type: "addPoint", at: A });
    s = plannerSession(s, { type: "addPoint", at: B });
    s = plannerSession(s, { type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] });
    s = plannerSession(s, { type: "addPoint", at: C });
    s = plannerSession(s, { type: "addPoint", at: D, mode: "hike" });
    expect(s.trip.legs.map((l) => l.mode)).toEqual(["paddle", "paddle", "hike"]);
  });
});
