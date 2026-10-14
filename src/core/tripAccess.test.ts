// Seam 1: access status and warnings per paddle leg, per day and for the trip
// (spec #51, #58). Rule data is injected as small fakes.
import { describe, expect, it } from "vitest";
import type { LegRoute } from "./router";
import type { LatLng, Leg, Trip } from "./trip";
import { tripAccess } from "./tripAccess";
import { agreementStretch, fakeAccessRules, flandersSquare, forbiddenCanal } from "./testing/fakeAccessRules";

const flanders = fakeAccessRules([flandersSquare, forbiddenCanal, agreementStretch]);

/** Points for the fakes: the forbidden canal runs along 51.0 N, the agreement stretch along 3.8 E. */
const southOfCanal: LatLng = { lat: 50.99, lng: 4.0 };
const northOfCanal: LatLng = { lat: 51.01, lng: 4.0 };
const openA: LatLng = { lat: 51.1, lng: 4.0 };
const openB: LatLng = { lat: 51.2, lng: 4.1 };
const agreementA: LatLng = { lat: 50.7, lng: 3.8 };
const agreementB: LatLng = { lat: 50.8, lng: 3.8 };

const routed = (...points: LatLng[]): LegRoute => ({
  status: "routed",
  geometry: points.map((p) => ({ ...p, elevation: 0 })),
});

function trip(points: LatLng[], legs: Leg[], extra: Partial<Trip> = {}): Trip {
  return { name: "", points, legs, ...extra };
}

describe("access status per paddle leg", () => {
  it("a paddle leg crossing a forbidden canal is forbidden on its day's date, with every reason", () => {
    const t = trip(
      [southOfCanal, northOfCanal],
      [{ mode: "paddle", route: routed(southOfCanal, northOfCanal) }],
      { startDate: "2026-10-20" },
    );
    const access = tripAccess(t, flanders, { today: "2026-10-14" });
    expect(access.dated).toBe(true);
    const leg = access.legs[0]!;
    expect(leg.date).toBe("2026-10-20");
    expect(leg.status.state).toBe("forbidden");
    expect(leg.status.reasons.map((r) => r.kind === "rule" && r.recordId)).toEqual(["test-canal", "flanders"]);
  });
});

describe("warnings per paddle leg", () => {
  const today = { today: "2026-10-14" };
  const paddle = (a: LatLng, b: LatLng): Trip =>
    trip([a, b], [{ mode: "paddle", route: routed(a, b) }], { startDate: "2026-10-20" });

  it("forbidden water gives a warning with its reason and source", () => {
    const leg = tripAccess(paddle(southOfCanal, northOfCanal), flanders, today).legs[0]!;
    expect(leg.warnings).toEqual([
      {
        kind: "forbidden",
        leg: 0,
        day: 0,
        date: "2026-10-20",
        reason: expect.objectContaining({
          recordId: "test-canal",
          ruleText: "Excluded by the waterway manager.",
          source: { title: "Visuris: Kano", url: "https://www.visuris.be/kano" },
        }),
      },
    ]);
  });

  it("open water gives no warning", () => {
    expect(tripAccess(paddle(openA, openB), flanders, today).legs[0]!.warnings).toEqual([]);
  });

  it("a VMM agreement stretch is open without a warning, and keeps its text rules for the leg", () => {
    const leg = tripAccess(paddle(agreementA, agreementB), flanders, today).legs[0]!;
    expect(leg.status.state).toBe("open");
    expect(leg.warnings).toEqual([]);
    expect(leg.status.reasons).toEqual([
      expect.objectContaining({
        recordId: "test-agreement",
        conditions: ["No paddling from half an hour after sunset until sunrise."],
        link: { title: "VMM agreement", url: "https://vmm.vlaanderen.be/" },
      }),
    ]);
  });

  it("water without any rule gives an unknown warning", () => {
    const leg = tripAccess(paddle({ lat: 51.4, lng: 4.0 }, { lat: 51.6, lng: 4.0 }), flanders, today).legs[0]!;
    expect(leg.warnings.map((w) => [w.kind, w.reason.kind])).toEqual([["unknown", "no-rule"]]);
  });
});

describe("which legs get a status, and for which date", () => {
  it("each paddle leg uses its own day's date; hike legs and legs still being routed get none", () => {
    const t = trip(
      [openA, openB, southOfCanal, northOfCanal, openA],
      [
        { mode: "paddle", route: routed(openA, openB) },
        { mode: "hike", route: routed(openB, southOfCanal) },
        { mode: "paddle", route: routed(southOfCanal, northOfCanal) },
        { mode: "paddle", route: { status: "pending" } },
      ],
      { startDate: "2026-10-20", camps: [2] },
    );
    const { legs } = tripAccess(t, flanders, { today: "2026-10-14" });
    expect(legs.map((leg) => leg && [leg.day, leg.date, leg.status.state])).toEqual([
      [0, "2026-10-20", "open"],
      undefined,
      [1, "2026-10-21", "forbidden"],
      undefined,
    ]);
  });

  it("a paddle leg that failed to route is checked along its straight line", () => {
    const failed: Leg = { mode: "paddle", route: { status: "failed", failure: { kind: "no-route" } } };
    const t = trip([southOfCanal, northOfCanal], [failed]);
    expect(tripAccess(t, flanders, { today: "2026-10-14" }).legs[0]?.status.state).toBe("forbidden");
  });
});
