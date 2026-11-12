// Access status: whether water may be paddled (GLOSSARY: Access status; ADRs 0022, 0024).
// Pure evaluation over rule data that is passed in, like the router: the core
// never loads data, calls a network or reads a clock.
import { agwDay, agwHoursTable, type AgwCategory, type AgwClosure } from "./agw";
import { flowCheck, type FlowFigures, type FlowReadings, type FlowUnknown, type FlowVerdict } from "./flow";
import {
  boundsOf,
  insideArea,
  nearBounds,
  samplesAlong,
  touches,
  type Bounds,
  type Geometry,
  type Position,
} from "./geo";
import {
  officialVerdict,
  type OfficialCheck,
  type OfficialClosedVerdict,
  type OfficialReadings,
  type OfficialVerdict,
} from "./officialStatus";
import type { OfficialIncidents } from "./incident";
import type { LatLng } from "./trip";

export type { Geometry, Position } from "./geo";

/** The access states, from least to most restrictive: open, unknown, closed today, forbidden.
 * `checking` is transient: today's live flow is still loading, so nothing is claimed yet. */
export type AccessState = "open" | "closed-today" | "forbidden" | "unknown" | "checking";

/** Where a rule comes from: a legal text, a regulation or an official page. */
export type AccessSource = { readonly title: string; readonly url: string };

/** The gauge whose flow decides a Walloon stretch (AGW Annex 2). */
export type AgwGauge = {
  readonly name: string;
  /** The KiWIS station number, for the live flow. */
  readonly stationNo: string;
  /** True when the match to Annex 2 is a best guess (ADR 0024); the live flow shows it as assumed. */
  readonly assumed: boolean;
  /** True when this is the gauge the SPW uses, not the one Annex 2 names. */
  readonly spwPractice?: boolean;
};

/**
 * A Walloon stretch under the AGW of 19 March 2009 (ADRs 0022, 0024): its
 * category decides the season, the fishing opening days and the hours. The
 * flow limits are information here; the live flow check is in ./flow.
 */
export type AgwRule = {
  readonly type: "agw";
  readonly category: AgwCategory;
  /** Annex 2 minimum flow (72-hour mean), or null when none is set. */
  readonly minM3s: number | null;
  readonly maxM3s: number;
  /** The Annex 2 gauge, or null when no gauge matches. */
  readonly gauge: AgwGauge | null;
  /** The SPW stretch this record lies on (ADR 0035); absent where the SPW lists none. */
  readonly officialStretch?: string;
  readonly link?: AccessSource;
};

/**
 * What a rule says. A `fixed` rule has the same state on every date; an
 * `agw` rule (Wallonia) depends on the date; flow-dependent states
 * build on it.
 */
export type AccessRule = FixedRule | AgwRule;

export type FixedRule = {
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

/**
 * A lock on a waterway (GLOSSARY: Lock). Paddlers portage around locks, so a
 * lock is shown as a marker, not as a water with a status.
 */
export type LockMarker = {
  readonly id: string;
  readonly name: string;
  /** The region whose rules the lock belongs to, e.g. "flanders". */
  readonly region: string;
  readonly position: Position;
  /** Where the portage rule for this region comes from. */
  readonly source: AccessSource;
  /** When the rule was last researched, as YYYY-MM-DD. */
  readonly researched: string;
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
  /** Today's live flow readings, once asked for; they only apply when `date` is `today`. */
  readonly flows?: FlowReadings;
  /** True while today's live flows are being fetched: flow-dependent stretches are "checking", not open. */
  readonly flowsPending?: boolean;
  /**
   * Today's official status (ADR 0035), once asked for. It decides only when `date` is
   * `today`; on a later date a closure today is a note beside the rules.
   */
  readonly official?: OfficialReadings;
  /** True while today's official status is being fetched: stretches it decides are "checking", not open. */
  readonly officialPending?: boolean;
};

/** Why a Walloon stretch is closed on a date: the calendar (AGW art. 4), today's flow (art. 6), or the SPW itself. */
export type AccessClosure = AgwClosure | "low-flow" | "high-flow" | "official";

/** Why a piece of water has its status. */
export type AccessReason =
  | {
      readonly kind: "rule";
      readonly state: AccessState;
      readonly recordId: string;
      readonly name: string;
      /**
       * What the rules alone say. Absent where there is nothing but the state and the category
       * to say, which the UI words itself. On a stretch with an `official` verdict, the UI words the two together.
       */
      readonly ruleText?: string;
      readonly conditions?: readonly string[];
      readonly link?: AccessSource;
      readonly source: AccessSource;
      readonly researched: string;
      readonly unverified?: string;
      /** Walloon stretches: the AGW category. */
      readonly category?: AgwCategory;
      /** Walloon stretches closed today: because of the season, a fishing opening day, or the flow. */
      readonly closedBy?: AccessClosure;
      /** The rule's state also depends on flow (see `AccessRule.flowDependent`). */
      readonly flowDependent?: true;
      /** Walloon stretches on today's date: the live flow figures behind the status. */
      readonly flow?: FlowFigures;
      /**
       * Walloon stretches on today's date: what the official status says, once known (ADR 0035).
       * On a future date, only `unavailable`: there was no reading to note a closure today from.
       */
      readonly official?: OfficialVerdict;
      /** Walloon stretches on a future date: the SPW has closed it today, which may still apply then. */
      readonly closedToday?: OfficialClosedVerdict;
      /** The official stretch this water belongs to, where the SPW lists one. */
      readonly officialStretch?: string;
    }
  /** The place is outside every region with rules. */
  | { readonly kind: "no-rule"; readonly state: "unknown" };

export type AccessStatus = { readonly state: AccessState; readonly reasons: readonly AccessReason[] };

const DEFAULT_MATCH_WITHIN_M = 30;
/** Leg samples are at most this far apart, so short exceptions aren't skipped. */
const SAMPLE_STEP_M = 25;

const restrictiveness: Record<AccessState, number> = { open: 0, checking: 0.5, unknown: 1, "closed-today": 2, forbidden: 3 };

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
  const { rule } = record;
  if (rule.type === "agw") return evaluateAgw(record, rule, context);
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

const MONTH_SEASON = "Category 1.C stretches may be paddled only from 1 October to 15 March.";
const FISHING_DAYS = "the fishing opening days (3rd Saturday of March, 1st Saturday of June)";

const KAYAK_PAGE = "check today's official status on kayak.spw.wallonie.be";

const m3s = (value: number) => `${value} m³/s`;

/** Why today's flow can't decide, in one sentence. */
const flowUnknownText: Record<FlowUnknown, string> = {
  "no-gauge": "Flow unknown: no gauge matches this stretch, so its flow limits can't be checked",
  failed: "Flow unknown: the live flow service is unavailable",
  missing: "Flow unknown: the live flow service has no recent readings for this stretch's gauge",
  stale: "Flow unknown: the 72-hour mean flow isn't from today",
  "not-measured-yet": "Flow unknown: today's 08:00 flow isn't measured yet",
};

/**
 * A Walloon stretch's status on a date: season, fishing opening days and hours
 * (AGW art. 4), and on today's date the official status (ADR 0035) or, where
 * there's no reading, the live flow (art. 6). A calendar closure always stands.
 * A future date stays rule-based, with a note when the SPW has closed the stretch today.
 */
function evaluateAgw(record: AccessRecord, rule: AgwRule, context: AccessContext): AccessStatus {
  const { category } = rule;
  const { date, today } = context;
  const day = date === undefined ? undefined : agwDay(category, date);
  const hours = day
    ? [`Permitted hours on ${date}: ${day.hours.from}-${day.hours.to}`]
    : agwHoursTable(category).map((p) => `Permitted hours ${p.period}: ${p.from}-${p.to}`);
  const limits = [
    rule.minM3s !== null && `minimum ${m3s(rule.minM3s)} (72-hour mean)`,
    `maximum ${m3s(rule.maxM3s)}`,
  ].filter(Boolean);
  // Flow and official status are only known for today.
  const isToday = date !== undefined && date === today;
  const verdict: FlowVerdict = isToday ? flowCheck(rule, context.flows, today) : { kind: "not-checked" };
  const official = isToday ? officialVerdict(rule.officialStretch, context.official) : undefined;
  const officialPending = isToday && official === undefined && context.officialPending === true;
  // YYYY-MM-DD strings order as calendar days, so no time zone can move this.
  const isFuture = date !== undefined && today !== undefined && date > today;
  const verdictToday = isFuture ? officialVerdict(rule.officialStretch, context.official) : undefined;
  const closedToday = verdictToday?.kind === "closed" ? verdictToday : undefined;
  // With no reading a closure today can't be known, so a future date is marked like today.
  const unavailableToday = verdictToday?.kind === "unavailable" ? verdictToday : undefined;
  // With a reading (or one on its way), the official status replaces the flow check; the figures stay on show.
  const flowDecides = !officialPending && (!official || official.kind === "none" || official.kind === "unavailable");
  const figures = verdict.kind === "not-checked" ? undefined : verdict.figures;
  const conditions = [
    ...hours,
    figures
      ? `Flow limits: ${limits.join(", ")}.`
      : `Flow limits (checked for today only, with live flows): ${limits.join(", ")}.`,
    "Get in and out only at the designated aires.",
  ];

  let state: AccessState = "open";
  let closedBy: AccessClosure | undefined;
  let ruleText: string | undefined;
  if (day?.closure === "season") {
    state = "closed-today";
    closedBy = "season";
    ruleText = `Closed today: season. ${MONTH_SEASON}`;
  } else if (day?.closure === "fishing-day") {
    state = "closed-today";
    closedBy = "fishing-day";
    ruleText = `Closed today: fishing opening day. Category ${category} stretches are closed on ${FISHING_DAYS}.`;
  } else if (official?.kind === "closed") {
    state = "closed-today";
    closedBy = "official";
  } else if (officialPending) {
    state = "checking";
  } else if (official?.kind === "unrecognised") {
    state = "unknown";
  } else if (flowDecides && verdict.kind === "low") {
    state = "closed-today";
    closedBy = "low-flow";
    ruleText = `Closed today: low flow. The 72-hour mean flow (${m3s(verdict.figures.mean72h!.m3s)}) is below the minimum of ${m3s(rule.minM3s!)}.`;
  } else if (flowDecides && verdict.kind === "high") {
    state = "closed-today";
    closedBy = "high-flow";
    ruleText = `Closed today: high flow. The flow at 08:00 (${m3s(verdict.figures.at8!.m3s)}) is above the maximum of ${m3s(rule.maxM3s)}: based on measured flow; the official status may differ.`;
  } else if (flowDecides && verdict.kind === "not-checked" && context.flowsPending && isToday) {
    state = "checking";
  } else if (flowDecides && verdict.kind === "unknown") {
    state = "unknown";
    ruleText = `${flowUnknownText[verdict.why]}; ${KAYAK_PAGE}.`;
  } else if (category === "1.C" && !day) {
    // Without a date the 1.C season can't be told.
    state = "unknown";
  }

  const reason: AccessReason = {
    kind: "rule",
    state,
    recordId: record.id,
    name: record.name,
    ...(ruleText !== undefined && { ruleText }),
    conditions,
    ...(rule.link && { link: rule.link }),
    source: record.source,
    researched: record.researched,
    ...(record.unverified && { unverified: record.unverified }),
    category,
    ...(closedBy && { closedBy }),
    // Every stretch has flow limits: on a later date the flow decides on the day.
    flowDependent: true,
    ...(figures && { flow: figures }),
    ...(official && { official }),
    ...(unavailableToday && { official: unavailableToday }),
    ...(closedToday && { closedToday }),
    ...(rule.officialStretch && { officialStretch: rule.officialStretch }),
  };
  return { state, reasons: [reason] };
}

/**
 * What this status couldn't check with the SPW: the computed status stood in
 * for a reading on today's date, or on a future date a closure today can't be known.
 * Empty with a reading, while one loads, on a past date, and on water with no official stretch.
 *
 * Incidents aren't part of a status (ADR 0035), so pass them in to have a failure named
 * too, on water the SPW lists. Pass them only where they were asked for.
 */
export function officialNotChecked(status: AccessStatus, incidents?: OfficialIncidents): readonly OfficialCheck[] {
  const rules = status.reasons.flatMap((reason) => (reason.kind === "rule" ? [reason] : []));
  const closures = rules.some((reason) => reason.official?.kind === "unavailable");
  const hazards = incidents?.status === "failed" && rules.some((reason) => reason.officialStretch !== undefined);
  return [...(closures ? (["closures"] as const) : []), ...(hazards ? (["incidents"] as const) : [])];
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

/**
 * The access status of an official stretch, such as an official aire's: every record
 * on it is evaluated and the most restrictive wins. One official stretch can hold
 * several records, of different categories. Unknown when no record lies on it.
 */
export function officialStretchAccess(officialStretch: string, rules: AccessRules, context: AccessContext): AccessStatus {
  const records = rules.records.filter(
    ({ rule }) => rule.type === "agw" && rule.officialStretch === officialStretch,
  );
  return combineAccess(records.map((record) => evaluateRecord(record, context)));
}

/** A water record with its status, for drawing on the map. */
export type AccessFeature = { readonly record: AccessRecord; readonly status: AccessStatus };

/** The specific waters to draw on the map, each with its status on the context's date. */
export function accessFeatures(rules: AccessRules, context: AccessContext): AccessFeature[] {
  return rules.records
    .filter((record) => record.scope === "water")
    .map((record) => ({ record, status: evaluateRecord(record, context) }));
}

/** The regions (e.g. "wallonia") whose area contains the point; empty outside every region with rules. */
export function regionsAt(point: LatLng, rules: AccessRules): string[] {
  return rules.records
    .filter((record) => record.scope === "region" && applies(record, point))
    .map((record) => record.region);
}
