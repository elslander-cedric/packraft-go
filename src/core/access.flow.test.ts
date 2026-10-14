// #61: live flows feed into a Walloon stretch's access status for today, and
// paddle legs dated today use them (#58). Future dates say "check flow on the day".
import { describe, expect, it } from "vitest";
import { accessAt, accessFeatures, type AccessReason, type AccessRecord, type AccessStatus } from "./access";
import type { FlowReadings } from "./flow";
import type { LatLng, Trip } from "./trip";
import { tripAccess } from "./tripAccess";
import {
  fakeAccessRules,
  onWalloonAllYear,
  onWalloonWinter,
  walloniaSquare,
  walloonAllYear,
  walloonWinter,
} from "./testing/fakeAccessRules";

const today = "2026-10-14";
/** A 1.B stretch without a matching gauge, like Wanlin. */
const noGaugeStretch: AccessRecord = {
  ...walloonAllYear,
  id: "test-no-gauge",
  rule: { ...(walloonAllYear.rule as Extract<AccessRecord["rule"], { type: "agw" }>), gauge: null },
};
const rules = fakeAccessRules([walloniaSquare, walloonAllYear, walloonWinter]);
const wanlinRules = fakeAccessRules([walloniaSquare, noGaugeStretch]);

/** Readings for the fakes' gauge (station 1234): limits are minimum 2.5, maximum 44. */
function readings(mean72h: number, at8: number, meanDate = today): FlowReadings {
  return {
    status: "ok",
    gauges: {
      "1234": {
        mean72h: [{ at: `${meanDate}T01:00:00.000+02:00`, m3s: mean72h }],
        hourly: [
          { at: `${today}T08:00:00.000+02:00`, m3s: at8 },
          { at: `${today}T09:00:00.000+02:00`, m3s: at8 + 0.5 },
        ],
      },
    },
  };
}
const rule = (status: AccessStatus) => status.reasons[0] as Extract<AccessReason, { kind: "rule" }>;

describe("a Walloon stretch's status with today's flow", () => {
  it("is open when the flow is within the limits, with the figures behind it", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: today, today, flows: readings(5, 10) });
    expect(status.state).toBe("open");
    expect(rule(status).flow).toMatchObject({
      gauge: { name: "Test gauge", assumed: false },
      mean72h: { m3s: 5 },
      at8: { m3s: 10 },
      latest: { at: `${today}T09:00:00.000+02:00` },
      minM3s: 2.5,
      maxM3s: 44,
    });
  });

  it("is closed today on low flow: the 72-hour mean below the minimum", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: today, today, flows: readings(2, 10) });
    expect(status.state).toBe("closed-today");
    expect(rule(status)).toMatchObject({ closedBy: "low-flow", ruleText: expect.stringContaining("72-hour mean") });
  });

  it("is closed today on high flow, labelled as based on measured flow", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: today, today, flows: readings(5, 50) });
    expect(status.state).toBe("closed-today");
    expect(rule(status).closedBy).toBe("high-flow");
    expect(rule(status).ruleText).toContain("based on measured flow; the official status may differ");
  });

  it("is unknown when the service failed or the data is stale, pointing to the SPW's kayak page", () => {
    for (const flows of [{ status: "failed" } as const, readings(5, 10, "2026-10-13")]) {
      const status = accessAt(onWalloonAllYear, rules, { date: today, today, flows });
      expect(status.state).toBe("unknown");
      expect(rule(status).ruleText).toContain("kayak.spw.wallonie.be");
      expect(rule(status).link?.url).toBe("https://kayak.spw.wallonie.be/");
    }
  });

  it("decides a 1.C stretch in season by its flow too", () => {
    // 14 October is in the 1.C season (1 October to 15 March).
    const status = accessAt(onWalloonWinter, rules, { date: today, today, flows: readings(2, 10) });
    expect(status.state).toBe("closed-today");
    // The fake 1.C stretch has an assumed gauge: the figures say so.
    expect(rule(status).flow?.gauge.assumed).toBe(true);
  });

  it("without a matching gauge (Wanlin), the flow is unknown while season and hours are still checked", () => {
    const status = accessAt(onWalloonAllYear, wanlinRules, { date: today, today, flows: readings(5, 10) });
    expect(status.state).toBe("unknown");
    expect(rule(status).ruleText).toMatch(/no gauge/i);
    expect(rule(status).conditions).toContain("Permitted hours on 2026-10-14: 10:00-17:00");
    // A fishing opening day still closes it.
    const fishingDay = "2027-06-05";
    expect(accessAt(onWalloonAllYear, wanlinRules, { date: fishingDay, today: fishingDay }).state).toBe("closed-today");
  });

  it("uses flows only for today: another date is decided by the rules alone, without figures", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: "2026-10-20", today, flows: readings(2, 10) });
    expect(status.state).toBe("open");
    expect(rule(status).flow).toBeUndefined();
    expect(rule(status).flowDependent).toBe(true);
  });

  it("paints the map with today's flow", () => {
    const states = accessFeatures(rules, { date: today, today, flows: readings(2, 10) }).map((f) => f.status.state);
    expect(states).toEqual(["closed-today", "closed-today"]);
  });
});

describe("paddle legs on a Walloon stretch (#58 with #61)", () => {
  const along: LatLng[] = [
    { lat: 50.0, lng: 4.9 },
    { lat: 50.0, lng: 5.1 },
  ];
  const trip = (startDate: string): Trip => ({
    name: "",
    points: along,
    legs: [{ mode: "paddle", route: { status: "routed", geometry: along.map((p) => ({ ...p, elevation: 0 })) } }],
    startDate,
  });

  it("a leg dated today is closed on low flow, with a closed warning", () => {
    const access = tripAccess(trip(today), rules, { today, flows: readings(2, 10) });
    expect(access.legs[0]!.status.state).toBe("closed-today");
    expect(access.legs[0]!.warnings).toEqual([
      expect.objectContaining({ kind: "closed", reason: expect.objectContaining({ closedBy: "low-flow" }) }),
    ]);
  });

  it("a leg on a future date gets 'rules OK; check flow on the day'", () => {
    const access = tripAccess(trip("2026-12-01"), rules, { today, flows: readings(2, 10) });
    expect(access.legs[0]!.status.state).toBe("open");
    expect(access.legs[0]!.checkFlowOnTheDay).toBe(true);
    expect(access.legs[0]!.warnings.map((w) => w.kind)).toEqual(["check-flow"]);
  });
});
