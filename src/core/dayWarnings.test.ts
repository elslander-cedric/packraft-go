// A day card's warning chips: one per paddle leg with a real access warning,
// lock warning or aire warning, its most serious kind first.
import { describe, expect, it } from "vitest";
import type { LockMarker } from "./access";
import type { AireWarning } from "./aire";
import { dayWarnings } from "./dayWarnings";
import type { AccessWarning, DayAccess } from "./tripAccess";

const noRule = { kind: "no-rule", state: "unknown" } as const;
const warning = (kind: AccessWarning["kind"], leg: number, day = 0): AccessWarning => ({ kind, leg, day, reason: noRule });
const lock: LockMarker = {
  id: "lock-1",
  name: "Anderlecht",
  region: "brussels",
  position: [4.30174, 50.81956],
  source: { title: "Source", url: "https://example.org" },
  researched: "2026-01-01",
};
const aire = (kind: AireWarning["kind"], leg: number, day = 0): AireWarning => ({ kind, point: leg, leg, day });

function day(parts: Partial<DayAccess> = {}): DayAccess {
  return { day: 0, warnings: [], notes: [], lockWarnings: [], legsWithoutRules: 0, ...parts };
}

describe("a day's warnings per leg", () => {
  it("a day with no warnings has no chips, even with water without known rules", () => {
    expect(dayWarnings(0, day({ state: "unknown", legsWithoutRules: 2 }), [])).toEqual([]);
  });

  it("gives one chip per leg in leg order, each with its most serious kind and how many warnings it has", () => {
    const access = day({
      warnings: [warning("check-flow", 5), warning("forbidden", 1)],
      lockWarnings: [{ lock, leg: 3, day: 0 }],
    });
    const aires = [aire("put-in", 5), aire("take-out", 5)];
    expect(dayWarnings(0, access, aires)).toEqual([
      { leg: 1, kind: "forbidden", count: 1 },
      { leg: 3, kind: "lock", count: 1 },
      { leg: 5, kind: "check-flow", count: 3 },
    ]);
  });

  it("orders kinds forbidden, closed, check flow, lock, aire", () => {
    const access = day({ warnings: [warning("closed", 0)], lockWarnings: [{ lock, leg: 0, day: 0 }] });
    expect(dayWarnings(0, access, [aire("put-in", 0)])).toEqual([{ leg: 0, kind: "closed", count: 3 }]);
    expect(dayWarnings(0, day({ lockWarnings: [{ lock, leg: 0, day: 0 }] }), [aire("put-in", 0)])).toEqual([
      { leg: 0, kind: "lock", count: 2 },
    ]);
  });

  it("counts only this day's aire warnings, and shows them before the access rules are loaded", () => {
    const aires = [aire("put-in", 2, 1), aire("take-out", 4, 2)];
    expect(dayWarnings(1, undefined, aires)).toEqual([{ leg: 2, kind: "aire", count: 1 }]);
  });
});
