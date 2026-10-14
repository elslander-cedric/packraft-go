// Seam 1: access status and warnings per paddle leg, per day and for the trip
// (spec #51, #58). Rule data is injected as small fakes.
import { describe, expect, it } from "vitest";
import type { AccessRecord } from "./access";
import { tripToGpxFiles } from "./gpx";
import type { LegRoute } from "./router";
import { parseTrip, serialiseTrip } from "./saveFile";
import { applyEdit, type LatLng, type Leg, type Trip } from "./trip";
import { tripAccess } from "./tripAccess";
import { onWalloonAllYear, walloonAllYear, agreementStretch, fakeAccessRules, flandersSquare, forbiddenCanal } from "./testing/fakeAccessRules";

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

  it("water without any rule gives a note, not a warning (#78)", () => {
    const leg = tripAccess(paddle({ lat: 51.4, lng: 4.0 }, { lat: 51.6, lng: 4.0 }), flanders, today).legs[0]!;
    expect(leg.status.state).toBe("unknown");
    expect(leg.warnings).toEqual([]);
    expect(leg.notes.map((n) => n.reason.kind)).toEqual(["no-rule"]);
  });

  it("summaries don't count unknown as a warning and report the legs without rules separately (#78)", () => {
    const far: LatLng = { lat: 51.4, lng: 4.0 };
    const farther: LatLng = { lat: 51.6, lng: 4.0 };
    const t = trip(
      [southOfCanal, northOfCanal, far, farther],
      [
        { mode: "paddle", route: routed(southOfCanal, northOfCanal) },
        { mode: "paddle", route: routed(northOfCanal, far) },
        { mode: "paddle", route: routed(far, farther) },
      ],
    );
    const { trip: summary } = tripAccess(t, flanders, today);
    expect(summary.warnings.map((w) => w.kind)).toEqual(["forbidden"]);
    expect(summary.legsWithoutRules).toBeGreaterThanOrEqual(1);
    expect(summary.notes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("future dates and flow", () => {
  /** A stretch whose state also depends on the river's flow, along 4.2 E. */
  const flowStretch: AccessRecord = {
    ...agreementStretch,
    id: "test-flow-stretch",
    name: "Test flow stretch",
    rule: { type: "fixed", state: "open", text: "Open when the flow allows it.", flowDependent: true },
    geometry: { type: "LineString", coordinates: [[4.2, 50.6], [4.2, 50.9]] },
  };
  const rules = fakeAccessRules([flandersSquare, forbiddenCanal, flowStretch]);
  const flowA: LatLng = { lat: 50.7, lng: 4.2 };
  const flowB: LatLng = { lat: 50.8, lng: 4.2 };
  const onFlowStretch = (extra: Partial<Trip>) => trip([flowA, flowB], [{ mode: "paddle", route: routed(flowA, flowB) }], extra);

  it("on a future date, rules OK on flow-dependent water says: check flow on the day", () => {
    const leg = tripAccess(onFlowStretch({ startDate: "2026-10-20" }), rules, { today: "2026-10-14" }).legs[0]!;
    expect(leg.status.state).toBe("open");
    expect(leg.checkFlowOnTheDay).toBe(true);
    expect(leg.warnings).toEqual([
      expect.objectContaining({ kind: "check-flow", date: "2026-10-20", reason: expect.objectContaining({ recordId: "test-flow-stretch" }) }),
    ]);
  });

  it("today's date doesn't ask to check flow on the day", () => {
    const leg = tripAccess(onFlowStretch({ startDate: "2026-10-14" }), rules, { today: "2026-10-14" }).legs[0]!;
    expect(leg.checkFlowOnTheDay).toBe(false);
    expect(leg.warnings).toEqual([]);
  });

  it("a future date on water without a flow rule doesn't ask either", () => {
    const t = trip([openA, openB], [{ mode: "paddle", route: routed(openA, openB) }], { startDate: "2027-05-01" });
    expect(tripAccess(t, rules, { today: "2026-10-14" }).legs[0]!.checkFlowOnTheDay).toBe(false);
  });

  it("forbidden water on a future date is a ban, not a flow check", () => {
    const t = trip(
      [southOfCanal, northOfCanal, flowA, flowB],
      [
        { mode: "paddle", route: routed(southOfCanal, northOfCanal, flowA, flowB) },
        { mode: "hike", route: routed(flowA, flowB) },
        { mode: "hike", route: routed(flowA, flowB) },
      ],
      { startDate: "2026-10-20" },
    );
    const leg = tripAccess(t, rules, { today: "2026-10-14" }).legs[0]!;
    expect(leg.status.state).toBe("forbidden");
    expect(leg.checkFlowOnTheDay).toBe(false);
    expect(leg.warnings.map((w) => w.kind)).toEqual(["forbidden"]);
  });
});

describe("undated trips: the rules in general terms", () => {
  it("statuses are in general, with no date; bans still warn; flow is never 'on the day'", () => {
    const t = trip(
      [southOfCanal, northOfCanal, agreementA],
      [
        { mode: "paddle", route: routed(southOfCanal, northOfCanal) },
        { mode: "paddle", route: routed(agreementA, agreementB) },
      ],
    );
    const access = tripAccess(t, flanders, { today: "2026-10-14" });
    expect(access.dated).toBe(false);
    expect(access.legs[0]).not.toHaveProperty("date");
    expect(access.legs[0]!.warnings.map((w) => w.kind)).toEqual(["forbidden"]);
    expect(access.legs[0]!.warnings[0]).not.toHaveProperty("date");
    // The general rules (text, extra conditions) are kept for showing.
    expect(access.legs[1]!.status.reasons[0]).toMatchObject({ conditions: agreementStretch.rule.conditions });
    expect(access.legs.every((leg) => !leg?.checkFlowOnTheDay)).toBe(true);
  });
});

describe("per-day and trip summaries", () => {
  // Day 1: open paddle, hike. Day 2: forbidden paddle. Day 3: hike only.
  const t = trip(
    [openA, openB, southOfCanal, northOfCanal, openA],
    [
      { mode: "paddle", route: routed(openA, openB) },
      { mode: "hike", route: routed(openB, southOfCanal) },
      { mode: "paddle", route: routed(southOfCanal, northOfCanal) },
      { mode: "hike", route: routed(northOfCanal, openA) },
    ],
    { startDate: "2026-10-20", camps: [2, 3] },
  );
  const access = tripAccess(t, flanders, { today: "2026-10-14" });

  it("each day has the most restrictive status of its paddle legs and their warnings", () => {
    expect(access.days.map((day) => [day.day, day.date, day.state, day.warnings.map((w) => [w.kind, w.leg])])).toEqual([
      [0, "2026-10-20", "open", []],
      [1, "2026-10-21", "forbidden", [["forbidden", 2]]],
      [2, "2026-10-22", undefined, []],
    ]);
  });

  it("the trip summary has the most restrictive status and every warning, in leg order", () => {
    expect(access.trip.state).toBe("forbidden");
    expect(access.trip.warnings.map((w) => [w.kind, w.leg, w.day])).toEqual([["forbidden", 2, 1]]);
  });

  it("a trip without checked paddle legs has no status and no warnings", () => {
    const hikeOnly = trip([openA, openB], [{ mode: "hike", route: routed(openA, openB) }]);
    expect(tripAccess(hikeOnly, flanders, { today: "2026-10-14" }).trip).toEqual({
      warnings: [],
      notes: [],
      legsWithoutRules: 0,
    });
  });
});

describe("warnings never block", () => {
  const forbiddenTrip = trip(
    [southOfCanal, northOfCanal],
    [{ mode: "paddle", route: routed(southOfCanal, northOfCanal) }],
    { name: "Canal", startDate: "2026-10-20" },
  );

  it("a trip with a forbidden paddle leg can still be edited, saved and exported", () => {
    expect(tripAccess(forbiddenTrip, flanders, { today: "2026-10-14" }).trip.state).toBe("forbidden");

    const edited = applyEdit(forbiddenTrip, { type: "addPoint", at: openA });
    expect(edited.points).toHaveLength(3);
    const moved = applyEdit(forbiddenTrip, { type: "movePoint", index: 1, to: { lat: 51.02, lng: 4.0 } });
    expect(moved.points[1]).toEqual({ lat: 51.02, lng: 4.0 });

    const saved = parseTrip(serialiseTrip(forbiddenTrip));
    expect(saved).toMatchObject({ ok: true, trip: { name: "Canal", legs: [{ mode: "paddle" }] } });

    const files = tripToGpxFiles(forbiddenTrip, { untitledTrip: "Untitled", section: (name) => name });
    expect(files).toHaveLength(1);
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

describe("flows still loading (#85)", () => {
  const walloon = fakeAccessRules([walloonAllYear]);
  const a = { lat: onWalloonAllYear.lat, lng: 5.0 };
  const b = { lat: onWalloonAllYear.lat, lng: 5.1 };
  const dated = (startDate: string): Trip =>
    trip([a, b], [{ mode: "paddle", route: routed(a, b) }], { startDate });

  it("a flow-dependent stretch dated today is checking, not open, and day and trip summaries don't count it", () => {
    const access = tripAccess(dated("2026-10-14"), walloon, { today: "2026-10-14", flowsPending: true });
    expect(access.legs[0]!.status.state).toBe("checking");
    expect(access.legs[0]!.warnings).toEqual([]);
    expect(access.days[0].state).toBeUndefined();
    expect(access.trip.state).toBeUndefined();
  });

  it("another date, or flows that have arrived, are unchanged", () => {
    expect(tripAccess(dated("2026-10-20"), walloon, { today: "2026-10-14", flowsPending: true }).legs[0]!.status.state).toBe("open");
    expect(tripAccess(dated("2026-10-14"), walloon, { today: "2026-10-14" }).legs[0]!.status.state).toBe("open");
  });
});
