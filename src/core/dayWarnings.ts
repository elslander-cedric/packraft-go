// A day's warnings per paddle leg, for the chips on its day card. The warnings'
// text stays on the legs: a day only says which of its legs have any.
import type { AireWarning } from "./aire";
import type { AccessWarning, DayAccess } from "./tripAccess";

/** The kinds of warning a leg can have, most serious first. Unknown access is a note, not one (#78). */
export const dayWarningKinds = ["forbidden", "closed", "check-flow", "lock", "aire"] as const;
export type DayWarningKind = (typeof dayWarningKinds)[number];

/** One leg of a day with warnings: its most serious kind and how many it has in all. */
export type LegWarnings = {
  readonly leg: number;
  readonly kind: DayWarningKind;
  readonly count: number;
};

/**
 * The legs of day `day` with any access, lock or aire warning, in leg order.
 * `access` is undefined while the access rules load; the aire warnings still count.
 */
export function dayWarnings(day: number, access: DayAccess | undefined, aire: readonly AireWarning[]): LegWarnings[] {
  const kinds: { leg: number; kind: DayWarningKind }[] = [
    ...(access?.warnings ?? []).map((w: AccessWarning) => ({ leg: w.leg, kind: w.kind })),
    ...(access?.lockWarnings ?? []).map((w) => ({ leg: w.leg, kind: "lock" as const })),
    ...aire.filter((w) => w.day === day).map((w) => ({ leg: w.leg, kind: "aire" as const })),
  ];
  const legs = [...new Set(kinds.map((k) => k.leg))].sort((a, b) => a - b);
  return legs.map((leg) => {
    const own = kinds.filter((k) => k.leg === leg).map((k) => k.kind);
    const kind = dayWarningKinds.find((k) => own.includes(k))!;
    return { leg, kind, count: own.length };
  });
}
