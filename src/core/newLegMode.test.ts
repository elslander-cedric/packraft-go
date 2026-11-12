import { describe, expect, it } from "vitest";
import { applyEdit, emptyTrip, type Trip } from "./trip";
import { firstSession, plannerSession } from "./plannerSession";

const pointA = { lat: 50.4, lng: 5.5 };
const pointB = { lat: 50.5, lng: 5.6 };
const pointC = { lat: 50.6, lng: 5.7 };
const pointD = { lat: 50.7, lng: 5.8 };

const withTwoPoints = (): Trip =>
  applyEdit(applyEdit(emptyTrip(), { type: "addPoint", at: pointA }), { type: "addPoint", at: pointB });
const paddling = (): Trip => applyEdit(withTwoPoints(), { type: "setLegMode", index: 0, mode: "paddle" });

describe("a new leg takes the mode of the last leg", () => {
  it("makes the first leg a hike leg", () => {
    expect(withTwoPoints().legs.map((leg) => leg.mode)).toEqual(["hike"]);
  });

  it("takes the last leg's mode", () => {
    const trip = applyEdit(paddling(), { type: "addPoint", at: pointC });
    expect(trip.legs.map((leg) => leg.mode)).toEqual(["paddle", "paddle"]);
  });

  it("lets an explicit mode win", () => {
    const trip = applyEdit(paddling(), { type: "addPoint", at: pointC, mode: "hike" });
    expect(trip.legs.map((leg) => leg.mode)).toEqual(["paddle", "hike"]);
  });

  it("undoes the added point in one step", () => {
    const undone = applyEdit(applyEdit(paddling(), { type: "addPoint", at: pointC }), { type: "undo" });
    expect(undone.points).toEqual([pointA, pointB]);
    expect(undone.legs.map((leg) => leg.mode)).toEqual(["paddle"]);
  });

  it("works through the session, with and without an explicit mode", () => {
    let session = firstSession({ trip: emptyTrip() });
    session = plannerSession(session, { type: "addPoint", at: pointA, accessPoints: [], officialAires: [] });
    session = plannerSession(session, { type: "addPoint", at: pointB, accessPoints: [], officialAires: [] });
    session = plannerSession(session, {
      type: "setLegMode",
      index: 0,
      mode: "paddle",
      accessPoints: [],
      officialAires: [],
    });
    session = plannerSession(session, { type: "addPoint", at: pointC, accessPoints: [], officialAires: [] });
    session = plannerSession(session, {
      type: "addPoint",
      at: pointD,
      mode: "hike",
      accessPoints: [],
      officialAires: [],
    });
    expect(session.trip.legs.map((leg) => leg.mode)).toEqual(["paddle", "paddle", "hike"]);
  });
});
