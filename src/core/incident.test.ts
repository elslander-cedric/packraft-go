// #216: which of the SPW's incidents apply on a date, and in which words.
import { describe, expect, it } from "vitest";
import { accessAlong } from "./access";
import { dayWarnings } from "./dayWarnings";
import { incidentsOn, incidentsOnLine, incidentText, type Incident } from "./incident";
import { PASSING_TOLERANCE_M } from "./locks";
import type { LegRoute } from "./router";
import { fakeAccessRules, flandersSquare, forbiddenCanal, nearForbiddenCanal, onForbiddenCanal } from "./testing/fakeAccessRules";
import type { LatLng, Trip } from "./trip";
import { legsAccess, tripAccess, type TripAccessOptions } from "./tripAccess";

const incident = (over: Partial<Incident> = {}): Incident => ({
  id: "incident-1",
  spwId: 1,
  position: [5.5, 50.1],
  ...over,
});

describe("incidentsOn", () => {
  it("keeps an incident with no expiry on every date, however old it is", () => {
    const old = incident({ created: "2018-04-30" });
    expect(incidentsOn([old], "2026-11-02")).toEqual([old]);
    expect(incidentsOn([old], "2031-01-01")).toEqual([old]);
  });

  it("keeps an incident on its expiry date, and drops it from the day after", () => {
    const expiring = incident({ expires: "2026-11-02" });
    expect(incidentsOn([expiring], "2026-11-01")).toEqual([expiring]);
    expect(incidentsOn([expiring], "2026-11-02")).toEqual([expiring]);
    expect(incidentsOn([expiring], "2026-11-03")).toEqual([]);
  });
});

describe("incidents on a leg's line (#217)", () => {
  // 0.001 degrees of latitude is about 111 m.
  const west: LatLng = { lat: 51.1, lng: 4.0 };
  const east: LatLng = { lat: 51.1, lng: 4.1 };
  const at = (spwId: number, lng: number, lat: number) => incident({ id: `incident-${spwId}`, spwId, position: [lng, lat] });
  const ids = (found: readonly Incident[]) => found.map((i) => i.spwId);

  it("uses the obstacles' tolerance: one just inside it counts and one just outside doesn't", () => {
    const degrees = (m: number) => m / 111_195;
    const inside = at(1, 4.05, 51.1 + degrees(PASSING_TOLERANCE_M - 5));
    const outside = at(2, 4.06, 51.1 + degrees(PASSING_TOLERANCE_M + 5));
    expect(ids(incidentsOnLine([west, east], [inside, outside]))).toEqual([1]);
  });

  it("lists them in the order the leg meets them, whatever the SPW's order", () => {
    const found = [at(1, 4.08, 51.1), at(2, 4.02, 51.1), at(3, 4.05, 51.1)];
    expect(ids(incidentsOnLine([west, east], found))).toEqual([2, 3, 1]);
    expect(ids(incidentsOnLine([east, west], found))).toEqual([1, 3, 2]);
  });
});

describe("incident warnings in the trip's access (#217)", () => {
  const west: LatLng = { lat: 51.1, lng: 4.0 };
  const east: LatLng = { lat: 51.1, lng: 4.1 };
  const north: LatLng = { lat: 51.2, lng: 4.1 };
  const routed = (a: LatLng, b: LatLng): LegRoute => ({
    status: "routed",
    geometry: [a, b].map((p) => ({ ...p, elevation: 0 })),
  });
  const rules = fakeAccessRules([flandersSquare, forbiddenCanal]);
  const today = "2026-11-02";
  const onFirst = incident({ id: "incident-1", spwId: 1, position: [4.05, 51.1], textEn: "Mandatory get-out" });
  const onSecond = incident({ id: "incident-2", spwId: 2, position: [4.1, 51.15], textFr: "Travaux" });
  const reported = (...incidents: Incident[]): TripAccessOptions => ({ today, incidents: { status: "ok", incidents } });
  const paddled: Trip = {
    name: "",
    points: [west, east, north],
    legs: [
      { mode: "paddle", route: routed(west, east) },
      { mode: "paddle", route: routed(east, north) },
    ],
    startDate: "2026-11-20",
  };
  /** One paddle leg past `onFirst`, starting on `startDate`. */
  const oneLeg = (startDate?: string): Trip => ({
    name: "",
    points: [west, east],
    legs: [{ mode: "paddle", route: routed(west, east) }],
    ...(startDate !== undefined && { startDate }),
  });
  const found = (trip: Trip, ...incidents: Incident[]) =>
    tripAccess(trip, rules, reported(...incidents)).trip.incidentWarnings.map((w) => w.incident);

  it("warns on the leg, the day and the trip, in leg order, with the leg's day and date", () => {
    const access = tripAccess(paddled, rules, reported(onSecond, onFirst));
    const first = expect.objectContaining({ incident: onFirst, leg: 0, day: 0, date: "2026-11-20" });
    const second = expect.objectContaining({ incident: onSecond, leg: 1, day: 0, date: "2026-11-20" });
    expect(access.legs[0]!.incidentWarnings).toEqual([first]);
    expect(access.legs[1]!.incidentWarnings).toEqual([second]);
    expect(access.days[0].incidentWarnings).toEqual([first, second]);
    expect(access.trip.incidentWarnings).toEqual([first, second]);
  });

  it("gives a section the warnings of its own legs only", () => {
    const access = tripAccess(paddled, rules, reported(onFirst, onSecond));
    expect(legsAccess(access, { firstLeg: 1, lastLeg: 1 }).incidentWarnings.map((w) => w.incident)).toEqual([onSecond]);
  });

  it("gives no warning on a hike leg, on a paddle leg still being routed, or a leg it isn't near", () => {
    const hiked: Trip = { ...paddled, legs: [{ mode: "hike", route: routed(west, east) }, { mode: "paddle" }] };
    expect(found(hiked, onFirst, onSecond)).toEqual([]);
    expect(found(oneLeg(today), onSecond)).toEqual([]);
  });

  it("gives none while the incidents load or when they failed", () => {
    expect(tripAccess(paddled, rules, { today }).trip.incidentWarnings).toEqual([]);
    expect(tripAccess(paddled, rules, { today, incidents: { status: "failed" } }).trip.incidentWarnings).toEqual([]);
  });

  it("applies up to and on the expiry date, and not on the day after", () => {
    const ending = { ...onFirst, expires: "2026-11-20" };
    expect(found(oneLeg("2026-11-19"), ending)).toEqual([ending]);
    expect(found(oneLeg("2026-11-20"), ending)).toEqual([ending]);
    expect(found(oneLeg("2026-11-21"), ending)).toEqual([]);
  });

  it("judges each leg by its own day's date, across a month's end", () => {
    const camped: Trip = {
      ...paddled,
      legs: [
        { mode: "paddle", route: routed(west, east) },
        { mode: "paddle", route: routed(east, north) },
      ],
      camps: [1],
      startDate: "2026-11-30",
    };
    const access = tripAccess(camped, rules, reported({ ...onFirst, expires: "2026-11-30" }, { ...onSecond, expires: "2026-11-30" }));
    expect(access.days.map((d) => d.date)).toEqual(["2026-11-30", "2026-12-01"]);
    expect(access.legs[0]!.incidentWarnings).toHaveLength(1);
    expect(access.legs[1]!.incidentWarnings).toEqual([]);
  });

  it("applies an incident with no expiry on every date, however far off", () => {
    expect(found(oneLeg("2031-06-01"), onFirst)).toEqual([onFirst]);
  });

  it("with no date, judges the expiry against today", () => {
    expect(found(oneLeg(), { ...onFirst, expires: today })).toHaveLength(1);
    expect(found(oneLeg(), { ...onFirst, expires: "2026-11-01" })).toEqual([]);
  });

  it("never changes an access state or blocks, even when its text says the river is closed", () => {
    const closure = { ...onFirst, textEn: "River closed (works in progress)" };
    const open = tripAccess(oneLeg(today), rules, reported(closure));
    expect(open.legs[0]!.incidentWarnings).toHaveLength(1);
    expect(open.legs[0]!.status).toEqual(tripAccess(oneLeg(today), rules, { today }).legs[0]!.status);
    expect(open.legs[0]!.status.state).toBe("open");
    expect(open.trip.warnings).toEqual([]);

    const line = [nearForbiddenCanal, onForbiddenCanal];
    const crossing: Trip = { name: "", points: line, legs: [{ mode: "paddle", route: routed(line[0], line[1]) }] };
    const there = { ...closure, position: [line[0].lng, line[0].lat] as const };
    expect(tripAccess(crossing, rules, reported(there)).legs[0]!.status).toEqual(accessAlong(line, rules, { today }));
  });

  it("gives a day's chip an incident kind, ahead of an obstacle's and an aire's", () => {
    const obstacle = {
      id: "obstacle-1",
      spwId: 1,
      kind: "dam",
      position: [4.02, 51.1],
      lastChanged: "2023-01-23",
      source: { title: "SPW", url: "https://example.org/spw" },
      snapshot: "2026-11-02",
    } as const;
    const { days } = tripAccess(paddled, rules, { ...reported(onFirst), obstacles: [obstacle] });
    expect(dayWarnings(0, days[0], [{ kind: "put-in", point: 0, leg: 0, day: 0 }])).toEqual([{ leg: 0, kind: "incident", count: 3 }]);
  });
});

describe("incidentText", () => {
  it("reads the SPW's English text when there is one", () => {
    expect(incidentText(incident({ textEn: "River closed", textFr: "Rivière fermée" }))).toBe("River closed");
  });

  it("falls back to the French", () => {
    expect(incidentText(incident({ textFr: "Rivière fermée" }))).toBe("Rivière fermée");
  });

  it("has nothing to say when the SPW gives no text", () => {
    expect(incidentText(incident())).toBeUndefined();
  });
});
