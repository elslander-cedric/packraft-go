// Trip access in areas with no rule, using the real built-in rule data.
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "../access/builtInRules";
import { tripAccess } from "./tripAccess";
import type { LatLng, Trip } from "./trip";

const routed = (...points: LatLng[]) => ({
  status: "routed" as const,
  geometry: points.map((x) => ({ ...x, elevation: 0 })),
});
const paddle = (pointA: LatLng, pointB: LatLng, startDate?: string): Trip => ({
  name: "",
  points: [pointA, pointB],
  legs: [{ mode: "paddle", route: routed(pointA, pointB) }],
  ...(startDate && { startDate }),
});
const today = { today: "2026-10-14" };

describe("areas with no rule (built-in data)", () => {
  it("Netherlands (Amsterdam canal)", () => {
    const access = tripAccess(
      paddle({ lat: 52.37, lng: 4.89 }, { lat: 52.372, lng: 4.9 }, "2026-10-20"),
      builtInAccessRules,
      today,
    );
    expect(access.legs[0]!.status.state).toBe("unknown");
    // Updated: unknown access is a note, not a warning (#78).
    expect(access.legs[0]!.warnings).toHaveLength(0);
    expect(access.legs[0]!.notes).toHaveLength(1);
  });
  it("Brussels (Zenne)", () => {
    const access = tripAccess(
      paddle({ lat: 50.85, lng: 4.34 }, { lat: 50.86, lng: 4.35 }, "2026-10-20"),
      builtInAccessRules,
      today,
    );
    expect(access.legs[0]!.status.state).toBe("unknown");
    // Updated: Brussels now has water records (#57); this leg crosses the Senne, which is
    // unknown too, so it gets the region's and the Senne's unknown warnings (#57).
    // Updated: these are notes now, not warnings (#78).
    expect(access.legs[0]!.warnings).toEqual([]);
    expect(
      access.legs[0]!.notes.map((note) => (note.reason.kind === "rule" ? note.reason.recordId : note.reason.kind)),
    ).toEqual(["brussels", "brussels-senne"]);
  });
  it("Walloon Meuse at Dinant (Wallonia rules)", () => {
    const access = tripAccess(
      paddle({ lat: 50.26, lng: 4.91 }, { lat: 50.265, lng: 4.915 }, "2026-07-10"),
      builtInAccessRules,
      today,
    );
    // Updated: #59 (PR #75) adds the Wallonia rules; unlisted Walloon water is now Forbidden, as the #58 criterion says. (#59)
    expect(access.legs[0]!.status.state).toBe("forbidden");
  });
  it("Ghent-Terneuzen undated + dated, multi-reason kept", () => {
    const pointA = { lat: 51.08505, lng: 3.72577 },
      pointB = { lat: 51.09192, lng: 3.72955 };
    const access = tripAccess(paddle(pointA, pointB), builtInAccessRules, today);
    expect(access.dated).toBe(false);
    expect(access.legs[0]!.status.state).toBe("forbidden");
  });
});
