// Tester acceptance checks for #58, using the real built-in rule data.
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "../access/builtInRules";
import { tripAccess } from "./tripAccess";
import type { LatLng, Trip } from "./trip";

const routed = (...p: LatLng[]) => ({ status: "routed" as const, geometry: p.map((x) => ({ ...x, elevation: 0 })) });
const paddle = (a: LatLng, b: LatLng, startDate?: string): Trip => ({
  name: "",
  points: [a, b],
  legs: [{ mode: "paddle", route: routed(a, b) }],
  ...(startDate && { startDate }),
});
const today = { today: "2026-10-14" };

describe("#58 tester: areas with no rule (built-in data)", () => {
  it("Netherlands (Amsterdam canal)", () => {
    const t = tripAccess(paddle({ lat: 52.37, lng: 4.89 }, { lat: 52.372, lng: 4.9 }, "2026-10-20"), builtInAccessRules, today);
    expect(t.legs[0]!.status.state).toBe("unknown");
    expect(t.legs[0]!.warnings).toHaveLength(1);
  });
  it("Brussels (Zenne)", () => {
    const t = tripAccess(paddle({ lat: 50.85, lng: 4.34 }, { lat: 50.86, lng: 4.35 }, "2026-10-20"), builtInAccessRules, today);
    expect(t.legs[0]!.status.state).toBe("unknown");
    // Updated: Brussels now has water records (#57); this leg crosses the Senne, which is
    // unknown too, so it gets the region's and the Senne's unknown warnings (#57).
    expect(t.legs[0]!.warnings.map((w) => w.kind)).toEqual(["unknown", "unknown"]);
    expect(t.legs[0]!.warnings.map((w) => (w.reason.kind === "rule" ? w.reason.recordId : w.reason.kind))).toEqual([
      "brussels",
      "brussels-senne",
    ]);
  });
  it("Walloon Meuse at Dinant (Wallonia rules from #59)", () => {
    const t = tripAccess(paddle({ lat: 50.26, lng: 4.91 }, { lat: 50.265, lng: 4.915 }, "2026-07-10"), builtInAccessRules, today);
    // Updated: #59 (PR #75) adds the Wallonia rules; unlisted Walloon water is now Forbidden, as the #58 criterion says. (#59)
    expect(t.legs[0]!.status.state).toBe("forbidden");
  });
  it("Ghent-Terneuzen undated + dated, multi-reason kept", () => {
    const a = { lat: 51.08505, lng: 3.72577 }, b = { lat: 51.09192, lng: 3.72955 };
    const t = tripAccess(paddle(a, b), builtInAccessRules, today);
    expect(t.dated).toBe(false);
    expect(t.legs[0]!.status.state).toBe("forbidden");
  });
});
