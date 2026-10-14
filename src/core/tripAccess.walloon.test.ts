// #58 x #59: the Wallonia criterion of "access status and warnings on paddle legs",
// on the real built-in data (the Walloon stretches arrive with #59).
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "../access/builtInRules";
import type { LatLng, Trip } from "./trip";
import { tripAccess } from "./tripAccess";

const routed = (...p: LatLng[]) => ({ status: "routed" as const, geometry: p.map((x) => ({ ...x, elevation: 0 })) });
const paddle = (points: LatLng[], startDate: string): Trip => ({
  name: "",
  points: [points[0]!, points[points.length - 1]!],
  legs: [{ mode: "paddle", route: routed(...points) }],
  startDate,
});
const today = { today: "2026-10-14" };

describe("paddle legs in Wallonia (#58 with #59)", () => {
  it("the Meuse at Dinant is not a listed stretch: a Forbidden warning with the AGW reason", () => {
    const leg = paddle([{ lat: 50.26, lng: 4.91 }, { lat: 50.265, lng: 4.915 }], "2026-07-10");
    const result = tripAccess(leg, builtInAccessRules, today);
    expect(result.legs[0]!.status.state).toBe("forbidden");
    const warning = result.legs[0]!.warnings.find((w) => w.kind === "forbidden");
    expect(warning).toBeDefined();
    expect(JSON.stringify(warning)).toContain("AGW");
    expect(result.trip.state).toBe("forbidden");
  });

  it("a leg on a 1.C stretch dated in July is closed today for the season", () => {
    const stretch = builtInAccessRules.records.find((r) => r.rule.type === "agw" && r.rule.category === "1.C")!;
    const coordinates = (stretch.geometry as unknown as { coordinates: readonly (readonly number[])[] }).coordinates;
    const points = coordinates.slice(0, 3).map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
    const result = tripAccess(paddle(points, "2026-07-15"), builtInAccessRules, today);
    expect(result.legs[0]!.status.state).toBe("closed-today");
    const warning = result.legs[0]!.warnings.find((w) => w.kind === "closed");
    expect(warning).toBeDefined();
    expect(JSON.stringify(warning)).toMatch(/season/i);
  });
});
