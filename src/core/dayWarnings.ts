// A day's warnings per paddle leg, for the chips on its day card. The warnings'
// text stays on the legs: a day only says which of its legs have any.
import type { AireWarning } from "./aire";
import type { AccessWarning, DayAccess } from "./tripAccess";

/** The kinds of warning a leg can have, most serious first. Unknown access is a note, not one. */
export const dayWarningKinds = ["forbidden", "closed", "check-flow", "lock", "incident", "obstacle", "aire"] as const;
export type DayWarningKind = (typeof dayWarningKinds)[number];

/** One leg of a day with warnings: its most serious kind and how many it has in all. */
export type LegWarnings = {
  readonly leg: number;
  readonly kind: DayWarningKind;
  readonly count: number;
};

/**
 * The legs of day `day` with any access, lock, incident, obstacle or aire warning, in leg order.
 * `access` is undefined while the access rules load; the aire warnings still count.
 */
export function dayWarnings(day: number, access: DayAccess | undefined, aire: readonly AireWarning[]): LegWarnings[] {
  const kinds: { leg: number; kind: DayWarningKind }[] = [
    ...(access?.warnings ?? []).map((accessWarning: AccessWarning) => ({
      leg: accessWarning.leg,
      kind: accessWarning.kind,
    })),
    ...(access?.lockWarnings ?? []).map((lockWarning) => ({ leg: lockWarning.leg, kind: "lock" as const })),
    ...(access?.incidentWarnings ?? []).map((incidentWarning) => ({
      leg: incidentWarning.leg,
      kind: "incident" as const,
    })),
    ...(access?.obstacleWarnings ?? []).map((obstacleWarning) => ({
      leg: obstacleWarning.leg,
      kind: "obstacle" as const,
    })),
    ...aire.filter((warning) => warning.day === day).map((warning) => ({ leg: warning.leg, kind: "aire" as const })),
  ];
  const legs = [...new Set(kinds.map((kind) => kind.leg))].sort((left, right) => left - right);
  return legs.map((leg) => {
    const own = kinds.filter((kind) => kind.leg === leg).map((entry) => entry.kind);
    const kind = dayWarningKinds.find((dayWarningKind) => own.includes(dayWarningKind))!;
    return { leg, kind, count: own.length };
  });
}
