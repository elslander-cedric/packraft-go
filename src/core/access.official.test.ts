// #210, ADR 0035: the SPW's official status decides a Walloon stretch for today. Readings
// are faked here; the adapter's tests use recorded answers.
import { describe, expect, it } from "vitest";
import {
  accessAt,
  accessFeatures,
  combineAccess,
  officialNotChecked,
  officialStretchAccess,
  type AccessReason,
  type AccessRecord,
  type AccessStatus,
  type AgwRule,
} from "./access";
import type { FlowReadings } from "./flow";
import type { OfficialReading, OfficialReadings } from "./officialStatus";
import {
  fakeAccessRules,
  onWalloonAllYear,
  onWalloonWinter,
  walloniaSquare,
  walloonAllYear,
  walloonWinter,
} from "./testing/fakeAccessRules";
import type { Leg, Trip } from "./trip";
import { tripAccess } from "./tripAccess";

const today = "2026-11-02";
const withStretch = (record: AccessRecord): AccessRecord => ({
  ...record,
  rule: { ...(record.rule as AgwRule), officialStretch: "TEST-1" },
});
const rules = fakeAccessRules([walloniaSquare, withStretch(walloonAllYear), withStretch(walloonWinter)]);
const unlistedRules = fakeAccessRules([walloniaSquare, walloonAllYear]);

const official = (reading: OfficialReading): OfficialReadings => ({ status: "ok", stretches: { "TEST-1": reading } });
const rule = (status: AccessStatus) => status.reasons[0] as Extract<AccessReason, { kind: "rule" }>;
const onAllYear = (reading: OfficialReading) =>
  accessAt(onWalloonAllYear, rules, { date: today, today, official: official(reading) });

/** Flow readings for the fakes' gauge (limits 2.5 to 44). */
function flows(mean72h: number, at8: number): FlowReadings {
  return {
    status: "ok",
    gauges: {
      "1234": {
        mean72h: [{ at: `${today}T01:00:00.000+01:00`, m3s: mean72h }],
        hourly: [{ at: `${today}T08:00:00.000+01:00`, m3s: at8 }],
      },
    },
  };
}

describe("the SPW's status codes", () => {
  it.each(["1", "5"])("code %s reads as open", (code) => {
    const status = onAllYear({ code });
    expect(status.state).toBe("open");
    expect(rule(status).official).toEqual({ kind: "open" });
  });

  it("code 2 reads as open, with a note that kayaks may soon be forbidden", () => {
    const status = onAllYear({ code: "2" });
    expect(status.state).toBe("open");
    expect(rule(status).official).toEqual({ kind: "open", soon: true });
  });

  it("code 0 is closed today by the SPW, with its reason", () => {
    const status = onAllYear({ code: "0", reasonFr: "Rivière non sécurisée" });
    expect(status.state).toBe("closed-today");
    expect(rule(status)).toMatchObject({
      closedBy: "official",
      official: { kind: "closed", cause: "too-low-or-stated", reason: "Rivière non sécurisée" },
    });
  });

  it("code 0 with no reason from the SPW still closes the stretch", () => {
    const status = onAllYear({ code: "0" });
    expect(status.state).toBe("closed-today");
    expect(rule(status).official).toEqual({ kind: "closed", cause: "too-low-or-stated" });
  });

  it("the reason is the English one when the SPW gives it, otherwise the French", () => {
    expect(rule(onAllYear({ code: "0", reasonEn: "Too low", reasonFr: "Trop bas" })).official).toMatchObject({
      reason: "Too low",
    });
    expect(rule(onAllYear({ code: "0", reasonFr: "Trop bas" })).official).toMatchObject({ reason: "Trop bas" });
  });

  it("code 3 is closed today for high water", () => {
    const status = onAllYear({ code: "3" });
    expect(status.state).toBe("closed-today");
    expect(rule(status)).toMatchObject({ closedBy: "official", official: { kind: "closed", cause: "high-water" } });
  });

  it("code 4 is closed today, out of season", () => {
    const status = onAllYear({ code: "4" });
    expect(status.state).toBe("closed-today");
    expect(rule(status)).toMatchObject({ closedBy: "official", official: { kind: "closed", cause: "out-of-season" } });
  });

  it.each(["6", "", "open", "1 "])("the unknown code %j never reads as open", (code) => {
    const status = onAllYear({ code });
    expect(status.state).toBe("unknown");
    expect(rule(status).official).toEqual({ kind: "unrecognised", code });
  });

  it("a reason on an open stretch isn't kept: the SPW's free text can be old", () => {
    expect(JSON.stringify(onAllYear({ code: "1", reasonFr: "Covid-19" }))).not.toContain("Covid");
  });
});

describe("official status against the rest", () => {
  // 21 March 2026 is a fishing opening day for 1.B stretches.
  const fishingDay = "2026-03-21";
  const onFishingDay = (reading: OfficialReading) =>
    accessAt(onWalloonAllYear, rules, { date: fishingDay, today: fishingDay, official: official(reading) });

  it("a calendar closure beats an official open", () => {
    const status = onFishingDay({ code: "1" });
    expect(status.state).toBe("closed-today");
    expect(rule(status).closedBy).toBe("fishing-day");
  });

  it("a calendar closure beats an unknown code", () => {
    expect(onFishingDay({ code: "9" }).state).toBe("closed-today");
  });

  it("a calendar closure stands beside an official closure, and the SPW's reason is kept", () => {
    expect(rule(onFishingDay({ code: "0", reasonFr: "Travaux" }))).toMatchObject({
      closedBy: "fishing-day",
      official: { reason: "Travaux" },
    });
  });

  it("a 1.C stretch closes in a drought, though it has no minimum flow", () => {
    const winter = withStretch(walloonWinter);
    const noMinimum = fakeAccessRules([
      walloniaSquare,
      { ...winter, rule: { ...(winter.rule as AgwRule), minM3s: null } },
    ]);
    const context = { date: today, today, flows: flows(0.1, 0.1) };
    expect(accessAt(onWalloonWinter, noMinimum, context).state).toBe("open");
    const drought = "En raison des étiages sévères";
    const status = accessAt(onWalloonWinter, noMinimum, { ...context, official: official({ code: "0", reasonFr: drought }) });
    expect(status.state).toBe("closed-today");
    expect(rule(status).official).toMatchObject({ reason: drought });
  });

  it("an official open replaces a low flow, and the figures stay shown", () => {
    const status = accessAt(onWalloonAllYear, rules, {
      date: today,
      today,
      flows: flows(1, 10),
      official: official({ code: "1" }),
    });
    expect(status.state).toBe("open");
    expect(rule(status).flow).toMatchObject({ mean72h: { m3s: 1 } });
  });

  it("an official closure replaces a flow within the limits, and the figures stay shown", () => {
    const status = accessAt(onWalloonAllYear, rules, {
      date: today,
      today,
      flows: flows(5, 10),
      official: official({ code: "3" }),
    });
    expect(status.state).toBe("closed-today");
    expect(rule(status).flow).toMatchObject({ mean72h: { m3s: 5 } });
  });

  it("an official open doesn't wait for the flows, nor fail with them", () => {
    const reading = official({ code: "1" });
    const context = { date: today, today, official: reading };
    expect(accessAt(onWalloonAllYear, rules, { ...context, flowsPending: true }).state).toBe("open");
    expect(accessAt(onWalloonAllYear, rules, { ...context, flows: { status: "failed" } }).state).toBe("open");
  });

  it("applies to today only: a later date stays rule-based", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: "2026-11-03", today, official: official({ code: "0" }) });
    expect(status.state).toBe("open");
    expect(rule(status)).not.toHaveProperty("official");
  });

  it("the map's waters use it too", () => {
    const [feature] = accessFeatures(rules, { date: today, today, official: official({ code: "3" }) });
    expect(feature.status.state).toBe("closed-today");
  });
});

describe("on a future date", () => {
  const tomorrow = "2026-11-03";
  const later = (reading: OfficialReading, date = tomorrow) =>
    accessAt(onWalloonAllYear, rules, { date, today, official: official(reading) });

  it("the state stays rule-based, and a stretch closed today carries the note with the SPW's reason", () => {
    const status = later({ code: "0", reasonFr: "Arrêté ministériel" });
    expect(status.state).toBe("open");
    expect(rule(status)).not.toHaveProperty("closedBy");
    expect(rule(status).closedToday).toEqual({ kind: "closed", cause: "too-low-or-stated", reason: "Arrêté ministériel" });
  });

  it.each([
    ["3", "high-water"],
    ["4", "out-of-season"],
  ])("code %s carries the note with its cause", (code, cause) => {
    expect(rule(later({ code })).closedToday).toEqual({ kind: "closed", cause });
  });

  it.each(["1", "2", "5", "9"])("a stretch with code %s today has no note", (code) => {
    expect(rule(later({ code }))).not.toHaveProperty("closedToday");
  });

  it("a stretch with no reading, a failed service or no official stretch has no note", () => {
    const context = { date: tomorrow, today };
    expect(rule(accessAt(onWalloonAllYear, rules, context))).not.toHaveProperty("closedToday");
    expect(rule(accessAt(onWalloonAllYear, rules, { ...context, official: { status: "failed" } }))).not.toHaveProperty(
      "closedToday",
    );
    expect(rule(accessAt(onWalloonAllYear, unlistedRules, { ...context, official: official({ code: "0" }) }))).not.toHaveProperty(
      "closedToday",
    );
  });

  it("nothing waits for the official status", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: tomorrow, today, officialPending: true });
    expect(status.state).toBe("open");
  });

  it("a calendar closure on that date keeps its own reason, and the note stands beside it", () => {
    const fishingDay = "2027-03-20"; // 3rd Saturday of March.
    const status = later({ code: "0", reasonFr: "Travaux" }, fishingDay);
    expect(status.state).toBe("closed-today");
    expect(rule(status).closedBy).toBe("fishing-day");
    expect(rule(status).closedToday).toMatchObject({ reason: "Travaux" });
  });

  it("today and past dates have no note: today the status itself says so, and a past date isn't asked", () => {
    expect(rule(later({ code: "0" }, today))).not.toHaveProperty("closedToday");
    expect(rule(later({ code: "0" }, "2026-11-01"))).not.toHaveProperty("closedToday");
  });

  it("the note goes by calendar days, so the day after today is future whatever the time zone", () => {
    const lateTonight = accessAt(onWalloonAllYear, rules, { date: "2026-11-01", today: "2026-10-31", official: official({ code: "0" }) });
    expect(rule(lateTonight).closedToday).toBeDefined();
    const newMonth = accessAt(onWalloonAllYear, rules, { date: "2027-01-01", today: "2026-12-31", official: official({ code: "0" }) });
    expect(rule(newMonth).closedToday).toBeDefined();
  });

  it("an undated status has no note", () => {
    expect(rule(accessAt(onWalloonAllYear, rules, { today, official: official({ code: "0" }) }))).not.toHaveProperty("closedToday");
  });

  it("the map's waters carry it", () => {
    const [feature] = accessFeatures(rules, { date: tomorrow, today, official: official({ code: "0" }) });
    expect(feature.status.state).toBe("open");
    expect(rule(feature.status).closedToday).toBeDefined();
  });

  it("a paddle leg on that date gets check-flow with the note on its reason, and never a closure", () => {
    const points = [onWalloonAllYear, { ...onWalloonAllYear, lng: onWalloonAllYear.lng + 0.001 }];
    const leg: Leg = { mode: "paddle", route: { status: "routed", geometry: points.map((p) => ({ ...p, elevation: 0 })) } };
    const trip: Trip = { name: "Test", points, legs: [leg], startDate: tomorrow };
    const access = tripAccess(trip, rules, { today, official: official({ code: "0", reasonFr: "Travaux" }) });
    expect(access.legs[0]!.status.state).toBe("open");
    expect(access.legs[0]!.warnings).toEqual([
      expect.objectContaining({
        kind: "check-flow",
        reason: expect.objectContaining({ closedToday: expect.objectContaining({ reason: "Travaux" }) }),
      }),
    ]);
  });
});

describe("a paddle leg dated today", () => {
  const points = [onWalloonAllYear, { ...onWalloonAllYear, lng: onWalloonAllYear.lng + 0.001 }];
  const leg: Leg = { mode: "paddle", route: { status: "routed", geometry: points.map((p) => ({ ...p, elevation: 0 })) } };
  const paddle: Trip = { name: "Test", points, legs: [leg], startDate: today };

  it("on an officially closed stretch gets the closure warning with its reason", () => {
    const access = tripAccess(paddle, rules, { today, official: official({ code: "0", reasonFr: "Travaux" }) });
    expect(access.legs[0]!.warnings).toEqual([
      expect.objectContaining({
        kind: "closed",
        reason: expect.objectContaining({ closedBy: "official", official: expect.objectContaining({ reason: "Travaux" }) }),
      }),
    ]);
  });

  it("is checking while the official status loads", () => {
    const access = tripAccess(paddle, rules, { today, flows: flows(5, 10), officialPending: true });
    expect(access.legs[0]!.status.state).toBe("checking");
    expect(access.legs[0]!.warnings).toEqual([]);
  });
});

describe("with no reading", () => {
  it("the computed status stands when the service failed, marked as unavailable", () => {
    const status = accessAt(onWalloonAllYear, rules, {
      date: today,
      today,
      flows: flows(5, 10),
      official: { status: "failed" },
    });
    expect(status.state).toBe("open");
    expect(rule(status).official).toEqual({ kind: "unavailable" });
  });

  it("the computed status stands when the answer leaves the stretch out, marked as unavailable", () => {
    const status = accessAt(onWalloonAllYear, rules, {
      date: today,
      today,
      flows: flows(1, 10),
      official: { status: "ok", stretches: {} },
    });
    expect(rule(status)).toMatchObject({ closedBy: "low-flow", official: { kind: "unavailable" } });
  });

  it("a record with no official stretch says none exists, and its computed status stands", () => {
    const status = accessAt(onWalloonAllYear, unlistedRules, {
      date: today,
      today,
      flows: flows(5, 10),
      official: official({ code: "0" }),
    });
    expect(status.state).toBe("open");
    expect(rule(status).official).toEqual({ kind: "none" });
  });
});

describe("official status and flows fail apart (#211)", () => {
  const down = { status: "failed" } as const;

  it("with the SPW down, the flows still decide", () => {
    const low = accessAt(onWalloonAllYear, rules, { date: today, today, flows: flows(1, 10), official: down });
    expect(low.state).toBe("closed-today");
    expect(rule(low).closedBy).toBe("low-flow");
    expect(rule(low).flow).toBeDefined();
  });

  it("with the flows down, the SPW still decides", () => {
    const closed = accessAt(onWalloonAllYear, rules, {
      date: today,
      today,
      flows: down,
      official: official({ code: "0", reasonFr: "Travaux" }),
    });
    expect(closed.state).toBe("closed-today");
    expect(rule(closed)).toMatchObject({ closedBy: "official", official: { kind: "closed", reason: "Travaux" } });

    const open = accessAt(onWalloonAllYear, rules, { date: today, today, flows: down, official: official({ code: "1" }) });
    expect(open.state).toBe("open");
    expect(officialNotChecked(open)).toEqual([]);
  });

  it("with both down the status is unknown, and it says official closures weren't checked", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: today, today, flows: down, official: down });
    expect(status.state).toBe("unknown");
    expect(officialNotChecked(status)).toEqual(["closures"]);
  });
});

describe("what wasn't checked with the SPW (#211)", () => {
  const context = { date: today, today, flows: flows(5, 10) };

  it("is the official closures when the service failed", () => {
    expect(officialNotChecked(accessAt(onWalloonAllYear, rules, { ...context, official: { status: "failed" } }))).toEqual([
      "closures",
    ]);
  });

  it("is the official closures when the answer leaves the stretch out", () => {
    const status = accessAt(onWalloonAllYear, rules, { ...context, official: { status: "ok", stretches: {} } });
    expect(officialNotChecked(status)).toEqual(["closures"]);
  });

  it("names the closures once, however many stretches a status covers", () => {
    const status = combineAccess([
      accessAt(onWalloonAllYear, rules, { ...context, official: { status: "failed" } }),
      accessAt(onWalloonWinter, rules, { ...context, official: { status: "failed" } }),
    ]);
    expect(status.reasons).toHaveLength(2);
    expect(officialNotChecked(status)).toEqual(["closures"]);
  });

  it("is nothing with a reading", () => {
    expect(officialNotChecked(onAllYear({ code: "1" }))).toEqual([]);
  });

  it("is nothing while the reading is on its way", () => {
    expect(officialNotChecked(accessAt(onWalloonAllYear, rules, { ...context, officialPending: true }))).toEqual([]);
  });

  it("is nothing on a stretch the SPW doesn't list", () => {
    const status = accessAt(onWalloonAllYear, unlistedRules, { ...context, official: { status: "failed" } });
    expect(officialNotChecked(status)).toEqual([]);
  });

  it("is the official closures on a future date too, as a closure today can't be known then", () => {
    const status = accessAt(onWalloonAllYear, rules, { ...context, date: "2026-11-20", official: { status: "failed" } });
    expect(status.state).toBe("open");
    expect(officialNotChecked(status)).toEqual(["closures"]);
  });

  it("is the official closures on a future date when the answer leaves the stretch out", () => {
    const status = accessAt(onWalloonAllYear, rules, { today, date: "2026-11-20", official: { status: "ok", stretches: {} } });
    expect(officialNotChecked(status)).toEqual(["closures"]);
  });

  it("is nothing on a future date with a reading", () => {
    const open = accessAt(onWalloonAllYear, rules, { today, date: "2026-11-20", official: official({ code: "1" }) });
    expect(officialNotChecked(open)).toEqual([]);
    const closed = accessAt(onWalloonAllYear, rules, { today, date: "2026-11-20", official: official({ code: "0" }) });
    expect(officialNotChecked(closed)).toEqual([]);
  });

  it("is nothing on a future date while the reading is on its way", () => {
    const status = accessAt(onWalloonAllYear, rules, { today, date: "2026-11-20", officialPending: true });
    expect(officialNotChecked(status)).toEqual([]);
  });

  it("is nothing on a future date on a stretch the SPW doesn't list", () => {
    const status = accessAt(onWalloonAllYear, unlistedRules, { today, date: "2026-11-20", official: { status: "failed" } });
    expect(officialNotChecked(status)).toEqual([]);
  });

  it("is nothing on a past date", () => {
    const status = accessAt(onWalloonAllYear, rules, { today, date: "2026-10-20", official: { status: "failed" } });
    expect(officialNotChecked(status)).toEqual([]);
  });

  it("leaves a future date's status rule-based", () => {
    const status = accessAt(onWalloonAllYear, rules, { today, date: "2026-11-20", official: { status: "failed" } });
    expect(rule(status).closedToday).toBeUndefined();
    expect(rule(status).flow).toBeUndefined();
  });

  it("is nothing outside every region with rules", () => {
    expect(officialNotChecked({ state: "unknown", reasons: [{ kind: "no-rule", state: "unknown" }] })).toEqual([]);
  });
});

describe("while the official status loads", () => {
  it("is checking, whatever the flows already say", () => {
    for (const reading of [flows(5, 10), flows(1, 10), { status: "failed" } as const]) {
      const status = accessAt(onWalloonAllYear, rules, { date: today, today, flows: reading, officialPending: true });
      expect(status.state).toBe("checking");
      expect(rule(status)).not.toHaveProperty("closedBy");
    }
  });

  it("a calendar closure needs no waiting", () => {
    const status = accessAt(onWalloonAllYear, rules, { date: "2026-03-21", today: "2026-03-21", officialPending: true });
    expect(status.state).toBe("closed-today");
  });

  it("a record with no official stretch doesn't wait for it", () => {
    const status = accessAt(onWalloonAllYear, unlistedRules, {
      date: today,
      today,
      flows: flows(5, 10),
      officialPending: true,
    });
    expect(status.state).toBe("open");
  });

  it("a later date doesn't wait for it", () => {
    expect(accessAt(onWalloonAllYear, rules, { date: "2026-11-03", today, officialPending: true }).state).toBe("open");
  });
});

describe("an official stretch's status (#213)", () => {
  const closedReading = { code: "0", reasonFr: "Arrêté ministériel" };

  it("is closed, with the SPW's reason, when the SPW closes it", () => {
    const status = officialStretchAccess("TEST-1", rules, { date: today, today, official: official(closedReading) });
    expect(status.state).toBe("closed-today");
    expect(rule(status).official).toEqual({ kind: "closed", cause: "too-low-or-stated", reason: "Arrêté ministériel" });
  });

  it("carries none of the SPW's old text when the stretch is open", () => {
    const status = officialStretchAccess("TEST-1", rules, {
      date: today,
      today,
      official: official({ code: "1", reasonFr: "Fermé en 2021" }),
    });
    expect(status.state).toBe("open");
    expect(JSON.stringify(status)).not.toContain("Fermé en 2021");
  });

  it("takes the most restrictive of the records on the stretch", () => {
    // In June the 1.C record is out of season; the 1.B record on the same stretch isn't.
    const june = "2026-06-15";
    const status = officialStretchAccess("TEST-1", rules, {
      date: june,
      today: june,
      official: official({ code: "1" }),
    });
    expect(status.state).toBe("closed-today");
    expect(rule(status).closedBy).toBe("season");
  });

  it("falls back to the computed status when the service fails", () => {
    const status = officialStretchAccess("TEST-1", rules, {
      date: today,
      today,
      flows: flows(1, 10),
      official: { status: "failed" },
    });
    expect(status.state).toBe("closed-today");
    expect(rule(status)).toMatchObject({ closedBy: "low-flow", official: { kind: "unavailable" } });
  });

  it("is checking while the official status loads", () => {
    const status = officialStretchAccess("TEST-1", rules, { date: today, today, officialPending: true });
    expect(status.state).toBe("checking");
  });

  it("stays rule-based on a later date, whatever the SPW says today", () => {
    const status = officialStretchAccess("TEST-1", rules, {
      date: "2026-11-03",
      today,
      official: official(closedReading),
    });
    expect(status.state).toBe("open");
    expect(rule(status).closedToday).toEqual({ kind: "closed", cause: "too-low-or-stated", reason: "Arrêté ministériel" });
  });

  it("has no rule for a stretch no record lies on", () => {
    expect(officialStretchAccess("NOWHERE", rules, { date: today, today })).toEqual({
      state: "unknown",
      reasons: [{ kind: "no-rule", state: "unknown" }],
    });
  });
});
