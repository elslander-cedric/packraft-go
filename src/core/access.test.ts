// Seam 1: access status evaluation in the trip planner core (spec #51, #53).
// Rule data is injected as small fakes, so these tests don't depend on the shipped data.
import { describe, expect, it } from "vitest";
import { accessAlong, accessAt, accessFeatures, combineAccess, type AccessStatus } from "./access";
import {
  agreementStretch,
  fakeAccessRules,
  flandersSquare,
  forbiddenCanal,
  forbiddenPort,
  inForbiddenPort,
  insideFlanders,
  nearForbiddenCanal,
  onAgreementStretch,
  onForbiddenCanal,
  onUnlistedWalloonWater,
  onWalloonAllYear,
  onWalloonNavigable,
  onWalloonWinter,
  outsideAnyRegion,
  walloniaSquare,
  walloonAllYear,
  walloonNavigable,
  walloonWinter,
} from "./testing/fakeAccessRules";

const flanders = fakeAccessRules([flandersSquare, forbiddenCanal, forbiddenPort, agreementStretch]);

describe("access status in Flanders", () => {
  it("water in Flanders is open by default, citing the 2021 rule", () => {
    const status = accessAt(insideFlanders, fakeAccessRules([flandersSquare]), {});
    expect(status.state).toBe("open");
    expect(status.reasons).toEqual([
      expect.objectContaining({ kind: "rule", state: "open", recordId: "flanders", ruleText: flandersSquare.rule.text }),
    ]);
  });

  it("an excluded canal is forbidden, with its reason, source and research date", () => {
    const status = accessAt(onForbiddenCanal, fakeAccessRules([flandersSquare, forbiddenCanal]), {});
    expect(status.state).toBe("forbidden");
    expect(status.reasons).toEqual([
      {
        kind: "rule",
        state: "forbidden",
        recordId: "test-canal",
        name: "Test canal",
        ruleText: "Excluded by the waterway manager.",
        source: { title: "Visuris: Kano", url: "https://www.visuris.be/kano" },
        researched: "2026-10-12",
      },
    ]);
  });
});

describe("access status: where rules apply", () => {
  it("water near, but not on, an exception keeps the region's default", () => {
    expect(accessAt(nearForbiddenCanal, flanders, {}).state).toBe("open");
  });

  it("a wide water can be matched further from its centre line", () => {
    const wideCanal = { ...forbiddenCanal, matchWithinM: 300 };
    expect(accessAt(nearForbiddenCanal, fakeAccessRules([flandersSquare, wideCanal]), {}).state).toBe("forbidden");
  });

  it("a port area is forbidden anywhere inside it", () => {
    const status = accessAt(inForbiddenPort, flanders, {});
    expect(status.state).toBe("forbidden");
    expect(status.reasons.map((r) => r.kind === "rule" && r.recordId)).toEqual(["test-port"]);
  });

  it("a place outside every region is unknown: no rule", () => {
    expect(accessAt(outsideAnyRegion, flanders, {})).toEqual({
      state: "unknown",
      reasons: [{ kind: "no-rule", state: "unknown" }],
    });
  });

  it("an agreement stretch is open, with its text rules, a link and what is unverified", () => {
    const status = accessAt(onAgreementStretch, flanders, { date: "2026-10-12" });
    expect(status.state).toBe("open");
    expect(status.reasons).toEqual([
      expect.objectContaining({
        recordId: "test-agreement",
        conditions: ["No paddling from half an hour after sunset until sunrise."],
        link: { title: "VMM agreement", url: "https://vmm.vlaanderen.be/" },
        unverified: "Whether the agreement was renewed.",
      }),
    ]);
  });
});

describe("access status along a paddle leg", () => {
  it("a leg crossing an excluded canal is forbidden, listing every reason, most restrictive first", () => {
    const leg = [
      { lat: 50.99, lng: 4.0 },
      { lat: 51.01, lng: 4.0 },
    ];
    const status = accessAlong(leg, flanders, {});
    expect(status.state).toBe("forbidden");
    expect(status.reasons.map((r) => r.kind === "rule" && r.recordId)).toEqual(["test-canal", "flanders"]);
  });

  it("a leg entirely on open water is open, with its reason once", () => {
    const leg = [
      { lat: 51.1, lng: 4.0 },
      { lat: 51.2, lng: 4.1 },
    ];
    const status = accessAlong(leg, flanders, {});
    expect(status.state).toBe("open");
    expect(status.reasons).toHaveLength(1);
  });

  it("a leg leaving every region is unknown", () => {
    const leg = [
      { lat: 51.4, lng: 4.0 },
      { lat: 51.6, lng: 4.0 },
    ];
    expect(accessAlong(leg, flanders, {}).state).toBe("unknown");
  });
});

describe("combining statuses", () => {
  const status = (state: AccessStatus["state"]): AccessStatus => ({
    state,
    reasons: [{ kind: "rule", state, recordId: state, name: state, ruleText: state, source: { title: "", url: "" }, researched: "2026-10-12" }],
  });

  it.each([
    [["open", "unknown"], "unknown"],
    [["unknown", "closed-today"], "closed-today"],
    [["closed-today", "forbidden", "open"], "forbidden"],
    [["open", "open"], "open"],
  ] as const)("%j gives %s", (states, expected) => {
    expect(combineAccess(states.map(status)).state).toBe(expected);
  });
});

describe("access features for the map", () => {
  it("lists every specific water with its status, but not the regions", () => {
    const features = accessFeatures(flanders, {});
    expect(features.map((f) => [f.record.id, f.status.state])).toEqual([
      ["test-canal", "forbidden"],
      ["test-port", "forbidden"],
      ["test-agreement", "open"],
    ]);
  });
});

describe("access status in Wallonia (AGW stretches, #59)", () => {
  const wallonia = fakeAccessRules([walloniaSquare, walloonNavigable, walloonAllYear, walloonWinter]);
  const conditionsOf = (status: AccessStatus) => {
    const reason = status.reasons[0];
    return reason.kind === "rule" ? (reason.conditions ?? []) : [];
  };

  it("a 1.C stretch in July is closed today for the season, with its reason", () => {
    const status = accessAt(onWalloonWinter, wallonia, { date: "2026-07-15" });
    expect(status.state).toBe("closed-today");
    expect(status.reasons).toEqual([
      expect.objectContaining({
        kind: "rule",
        state: "closed-today",
        recordId: "test-1c",
        closedBy: "season",
        category: "1.C",
        ruleText: expect.stringContaining("1 October to 15 March"),
      }),
    ]);
  });

  it("a 1.C stretch in January is open, with the hours of that date", () => {
    const status = accessAt(onWalloonWinter, wallonia, { date: "2027-01-12" });
    expect(status.state).toBe("open");
    expect(status.reasons[0]).toMatchObject({ kind: "rule", category: "1.C" });
    expect(conditionsOf(status)).toContain("Permitted hours on 2027-01-12: 10:00-17:00");
  });

  it("a 1.B stretch is open in July but closed on the 1st Saturday of June (fishing opening day)", () => {
    expect(accessAt(onWalloonAllYear, wallonia, { date: "2026-07-15" }).state).toBe("open");
    const status = accessAt(onWalloonAllYear, wallonia, { date: "2026-06-06" });
    expect(status.state).toBe("closed-today");
    expect(status.reasons[0]).toMatchObject({ closedBy: "fishing-day" });
    expect(accessAt(onWalloonAllYear, wallonia, { date: "2026-06-13" }).state).toBe("open");
  });

  it("a 1.A stretch is open on fishing opening days, with its spring hours", () => {
    const status = accessAt(onWalloonNavigable, wallonia, { date: "2026-06-06" });
    expect(status.state).toBe("open");
    expect(conditionsOf(status)).toContain("Permitted hours on 2026-06-06: 09:30-19:00");
  });

  it("without a date, 1.A and 1.B are open with every period's hours; 1.C is unknown", () => {
    expect(accessAt(onWalloonNavigable, wallonia, {}).state).toBe("open");
    const b = accessAt(onWalloonAllYear, wallonia, {});
    expect(b.state).toBe("open");
    expect(conditionsOf(b)).toContain("Permitted hours 1 Oct - 15 Jun: 10:00-17:00");
    expect(accessAt(onWalloonWinter, wallonia, {}).state).toBe("unknown");
  });

  it("shows the flow limits and the official link as information, keeping the assumed gauge flag in the data", () => {
    const status = accessAt(onWalloonWinter, wallonia, { date: "2027-01-12" });
    expect(conditionsOf(status).join(" ")).toMatch(/minimum 2\.5 m³\/s.*maximum 44 m³\/s/);
    const reason = status.reasons[0];
    expect(reason.kind === "rule" && reason.link?.url).toBe("https://kayak.spw.wallonie.be/");
    expect(walloonWinter.rule).toMatchObject({ gauge: { assumed: true } });
  });

  it("unlisted Walloon water is unknown (treated as not allowed), not forbidden", () => {
    const status = accessAt(onUnlistedWalloonWater, wallonia, { date: "2027-01-12" });
    expect(status.state).toBe("unknown");
    expect(status.reasons[0]).toMatchObject({ recordId: "wallonia" });
  });

  it("a leg along a stretch is closed today when the stretch is, and the stretch is painted for the date", () => {
    const leg = [
      { lat: 49.9, lng: 4.8 },
      { lat: 49.9, lng: 5.2 },
    ];
    expect(accessAlong(leg, wallonia, { date: "2026-07-15" }).state).toBe("closed-today");
    expect(accessAlong(leg, wallonia, { date: "2026-12-15" }).state).toBe("open");
    const stateOf = (date: string) =>
      accessFeatures(wallonia, { date }).find((f) => f.record.id === "test-1c")!.status.state;
    expect(stateOf("2026-07-15")).toBe("closed-today");
    expect(stateOf("2026-12-15")).toBe("open");
  });
});
