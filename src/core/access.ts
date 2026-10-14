// Access status: whether water may be paddled (GLOSSARY: Access status; ADRs 0022, 0024).
// Pure evaluation over rule data that is passed in, like the router: the core
// never loads data, calls a network or reads a clock.
import {
  boundsOf,
  insideArea,
  nearBounds,
  samplesAlong,
  touches,
  type Bounds,
  type Geometry,
} from "./geo";
import type { LatLng } from "./trip";

export type { Geometry, Position } from "./geo";

/** The four access states, from least to most restrictive is open, unknown, closed today, forbidden. */
export type AccessState = "open" | "closed-today" | "forbidden" | "unknown";

/** Where a rule comes from: a legal text, a regulation or an official page. */
export type AccessSource = { readonly title: string; readonly url: string };

/**
 * What a rule says. A `fixed` rule has the same state on every date; region-
 * and flow-dependent rules (Wallonia, #59 and #61) add their own types.
 */
export type AccessRule = {
  readonly type: "fixed";
  readonly state: "open" | "forbidden" | "unknown";
  /** Why the water has this state, in one sentence. */
  readonly text: string;
  /** Extra conditions that apply on open water, e.g. a VMM agreement's hours and water levels, as text. */
  readonly conditions?: readonly string[];
  /** Where to read the full conditions. */
  readonly link?: AccessSource;
  /**
   * True when the water's state also depends on the river's flow. Flow is only
   * known for today, so a future date can only say "rules OK; check flow on the day".
   */
  readonly flowDependent?: boolean;
};

/**
 * One rule record of the built-in access data.
 * - `region` records cover a whole region and give its default rule.
 * - `water` records are specific waters (a canal, a port, a stretch). They
 *   override their region's default where they apply.
 */
export type AccessRecord = {
  readonly id: string;
  readonly name: string;
  readonly scope: "region" | "water";
  /** The region whose rules this record belongs to, e.g. "flanders". */
  readonly region: string;
  readonly rule: AccessRule;
  readonly geometry: Geometry;
  /** How close (metres) a point must be to a line, or an area's edge, to be on this water. Default 30. */
  readonly matchWithinM?: number;
  readonly source: AccessSource;
  /** When the rule was last researched, as YYYY-MM-DD. */
  readonly researched: string;
  /** What the research could not confirm, if anything ([UNVERIFIED] in docs/research). */
  readonly unverified?: string;
};

/** All rule data the core evaluates against. */
export type AccessRules = { readonly records: readonly AccessRecord[] };

/**
 * The moment the status is asked for. Fixed rules ignore it; dated rules
 * (seasons, fishing days, hours) and flow readings use it.
 */
export type AccessContext = {
  /** The calendar date, YYYY-MM-DD, or absent for "in general". */
  readonly date?: string;
  /** Today's date, YYYY-MM-DD, when known: flow readings only apply to today, not to later dates. */
  readonly today?: string;
};

/** Why a piece of water has its status. */
export type AccessReason =
  | {
      readonly kind: "rule";
      readonly state: AccessState;
      readonly recordId: string;
      readonly name: string;
      readonly ruleText: string;
      readonly conditions?: readonly string[];
      readonly link?: AccessSource;
      readonly source: AccessSource;
      readonly researched: string;
      readonly unverified?: string;
      /** The rule's state also depends on flow (see `AccessRule.flowDependent`). */
      readonly flowDependent?: true;
    }
  /** The place is outside every region with rules. */
  | { readonly kind: "no-rule"; readonly state: "unknown" };

export type AccessStatus = { readonly state: AccessState; readonly reasons: readonly AccessReason[] };

const DEFAULT_MATCH_WITHIN_M = 30;
/** Leg samples are at most this far apart, so short exceptions aren't skipped. */
const SAMPLE_STEP_M = 25;

const restrictiveness: Record<AccessState, number> = { open: 0, unknown: 1, "closed-today": 2, forbidden: 3 };

const boundsCache = new WeakMap<AccessRecord, Bounds>();
function cachedBounds(record: AccessRecord): Bounds {
  let bounds = boundsCache.get(record);
  if (!bounds) boundsCache.set(record, (bounds = boundsOf(record.geometry)));
  return bounds;
}

/** True when the point is on (or in) the record's water or region. */
function applies(record: AccessRecord, point: LatLng): boolean {
  const withinM = record.scope === "region" ? 0 : (record.matchWithinM ?? DEFAULT_MATCH_WITHIN_M);
  if (!nearBounds(point, cachedBounds(record), withinM)) return false;
  // A region is an area: only its inside counts, not a margin around its border.
  if (record.scope === "region") return insideArea(point, record.geometry);
  return touches(point, record.geometry, withinM);
}

/** The status one record gives on the context's date. */
export function evaluateRecord(record: AccessRecord, context: AccessContext): AccessStatus {
  void context; // Fixed rules don't depend on the date.
  const { rule } = record;
  const reason: AccessReason = {
    kind: "rule",
    state: rule.state,
    recordId: record.id,
    name: record.name,
    ruleText: rule.text,
    ...(rule.conditions && { conditions: rule.conditions }),
    ...(rule.link && { link: rule.link }),
    source: record.source,
    researched: record.researched,
    ...(record.unverified && { unverified: record.unverified }),
    ...(rule.flowDependent && { flowDependent: true as const }),
  };
  return { state: rule.state, reasons: [reason] };
}

/**
 * The most restrictive status wins (forbidden, then closed today, then
 * unknown, then open), and every reason is kept, once.
 */
export function combineAccess(statuses: readonly AccessStatus[]): AccessStatus {
  if (statuses.length === 0) return noRule;
  let state: AccessState = "open";
  const reasons: AccessReason[] = [];
  const seen = new Set<string>();
  for (const status of statuses) {
    if (restrictiveness[status.state] > restrictiveness[state]) state = status.state;
    for (const reason of status.reasons) {
      const key = reason.kind === "rule" ? `rule:${reason.recordId}:${reason.state}` : reason.kind;
      if (seen.has(key)) continue;
      seen.add(key);
      reasons.push(reason);
    }
  }
  // Most restrictive reasons first, so the "why" leads.
  reasons.sort((a, b) => restrictiveness[b.state] - restrictiveness[a.state]);
  return { state, reasons };
}

const noRule: AccessStatus = { state: "unknown", reasons: [{ kind: "no-rule", state: "unknown" }] };

/**
 * The access status of the water at one point. Specific waters override their
 * region's default; where several apply, the most restrictive wins.
 */
export function accessAt(point: LatLng, rules: AccessRules, context: AccessContext): AccessStatus {
  const matching = rules.records.filter((record) => applies(record, point));
  const waters = matching.filter((record) => record.scope === "water");
  const chosen = waters.length > 0 ? waters : matching;
  if (chosen.length === 0) return noRule;
  return combineAccess(chosen.map((record) => evaluateRecord(record, context)));
}

/**
 * The access status along a line, such as a paddle leg: every place it passes
 * is checked, the most restrictive status wins and all reasons are kept.
 */
export function accessAlong(line: readonly LatLng[], rules: AccessRules, context: AccessContext): AccessStatus {
  const samples = samplesAlong(line, SAMPLE_STEP_M);
  if (samples.length === 0) return noRule;
  return combineAccess(samples.map((point) => accessAt(point, rules, context)));
}

/** A water record with its status, for drawing on the map. */
export type AccessFeature = { readonly record: AccessRecord; readonly status: AccessStatus };

/** The specific waters to draw on the map, each with its status on the context's date. */
export function accessFeatures(rules: AccessRules, context: AccessContext): AccessFeature[] {
  return rules.records
    .filter((record) => record.scope === "water")
    .map((record) => ({ record, status: evaluateRecord(record, context) }));
}
