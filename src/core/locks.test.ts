// #60: lock warnings on paddle legs, with tolerance for the line passing near a lock.
import { describe, expect, it } from "vitest";
import type { LockMarker } from "./access";
import { LOCK_TOLERANCE_M, locksOnLine } from "./locks";
import type { LegRoute } from "./router";
import type { LatLng, Trip } from "./trip";
import { tripAccess } from "./tripAccess";
import { fakeAccessRules, flandersSquare } from "./testing/fakeAccessRules";

const source = { title: "Rule", url: "https://example.org/rule" };
const lock = (id: string, lng: number, lat: number, name = id): LockMarker => ({
  id,
  name,
  region: "flanders",
  position: [lng, lat],
  source,
  researched: "2026-10-12",
});

// 0.001 degrees of latitude is about 111 m.
const west: LatLng = { lat: 51.1, lng: 4.0 };
const east: LatLng = { lat: 51.1, lng: 4.1 };
const line = [west, east];

describe("locks on a leg's line", () => {
  it("finds a lock on the line", () => {
    expect(locksOnLine(line, [lock("a", 4.05, 51.1)]).map((l) => l.id)).toEqual(["a"]);
  });

  it("tolerates a line passing near the lock, but not far from it", () => {
    const near = lock("near", 4.05, 51.1 + 0.0005); // about 55 m
    const far = lock("far", 4.05, 51.1 + 0.002); // about 220 m
    expect(LOCK_TOLERANCE_M).toBeGreaterThan(55);
    expect(locksOnLine(line, [near, far]).map((l) => l.id)).toEqual(["near"]);
  });

  it("ignores a lock beyond the end of the line", () => {
    expect(locksOnLine(line, [lock("past", 4.2, 51.1)])).toEqual([]);
  });

  it("warns once for two chambers of the same lock complex", () => {
    const pair = [lock("a", 4.05, 51.1, "Canal"), lock("b", 4.0505, 51.1, "Canal"), lock("c", 4.07, 51.1, "Canal")];
    expect(locksOnLine(line, pair).map((l) => l.id)).toEqual(["a", "c"]);
  });
});

describe("lock warnings in the trip's access", () => {
  const routed = (a: LatLng, b: LatLng): LegRoute => ({
    status: "routed",
    geometry: [a, b].map((p) => ({ ...p, elevation: 0 })),
  });
  const rules = fakeAccessRules([flandersSquare]);
  const trip: Trip = {
    name: "",
    points: [west, east, { lat: 51.2, lng: 4.1 }],
    legs: [
      { mode: "paddle", route: routed(west, east) },
      { mode: "hike", route: { status: "routed", geometry: [east, { lat: 51.2, lng: 4.1 }].map((p) => ({ ...p, elevation: 0 })) } },
    ],
    startDate: "2026-10-20",
  };
  const locks = [lock("a", 4.05, 51.1, "Sluis A")];

  it("lists the warning on the leg, the day and the trip, without blocking", () => {
    const access = tripAccess(trip, rules, { today: "2026-10-14", locks });
    const expected = [expect.objectContaining({ leg: 0, day: 0, date: "2026-10-20", lock: locks[0] })];
    expect(access.legs[0]!.lockWarnings).toEqual(expected);
    expect(access.days[0].lockWarnings).toEqual(expected);
    expect(access.trip.lockWarnings).toEqual(expected);
    expect(access.legs[0]!.status.state).toBe("open");
  });

  it("gives no warning without locks, or on a hike leg", () => {
    expect(tripAccess(trip, rules, { today: "2026-10-14" }).trip.lockWarnings).toEqual([]);
    const hike: Trip = { ...trip, legs: [{ ...trip.legs[0], mode: "hike" }, trip.legs[1]] };
    expect(tripAccess(hike, rules, { today: "2026-10-14", locks }).trip.lockWarnings).toEqual([]);
  });
});
