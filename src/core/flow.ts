// Live Walloon flows (ADR 0024, #61): the flow source interface and the AGW
// art. 6 flow rules. Pure: readings are passed in by whoever asked the flow
// source; the core never calls a service or reads a clock.
import type { AgwGauge, AgwRule } from "./access";
import type { CalendarDate } from "./calendarDate";

/**
 * One reading of a gauge's discharge. `at` is the service's timestamp in
 * the gauge's local time (CET/CEST) with its offset, e.g. "2026-10-14T08:00:00.000+02:00";
 * its date and hour are read from the text, so they never move with the
 * planner's own time zone.
 */
export type FlowReading = { readonly at: string; readonly m3s: number };

/** What the flow source knows about one gauge: the recent readings of its two series, oldest first. */
export type GaugeReadings = {
  /** The daily 72-hour mean discharge (one value a day). */
  readonly mean72h: readonly FlowReading[];
  /** The hourly mean discharge. */
  readonly hourly: readonly FlowReading[];
};

/**
 * Today's readings for a set of gauges, keyed by station number. A gauge the
 * service has no series for is absent. `failed` means the service could not
 * be reached or answered with an error.
 */
export type FlowReadings =
  | { readonly status: "ok"; readonly gauges: Readonly<Record<string, GaugeReadings>> }
  | { readonly status: "failed" };

/**
 * Gives the latest readings of these gauges (station numbers). The real
 * implementation (the KiWIS adapter) is injected; tests pass a fake.
 * Implementations never throw: a failure is a `failed` result.
 */
export interface FlowSource {
  readings(stationNos: readonly string[]): Promise<FlowReadings>;
}

/** The figures behind a stretch's flow status, for the detail panel. */
export type FlowFigures = {
  readonly gauge: AgwGauge;
  readonly minM3s: number | null;
  readonly maxM3s: number;
  /** The latest 72-hour mean. */
  readonly mean72h?: FlowReading;
  /** Today's hourly flow measured at 08:00. */
  readonly at8?: FlowReading;
  /** The latest hourly flow: when the gauge was last measured. */
  readonly latest?: FlowReading;
};

/**
 * Why the flow can't tell whether a stretch is open:
 * - `no-gauge`: no gauge matches the stretch (Wanlin).
 * - `failed`: the service failed.
 * - `missing`: the service has no series (or no values) for the gauge.
 * - `stale`: the 72-hour mean isn't from today.
 * - `not-measured-yet`: today's 08:00 flow isn't measured yet.
 */
export type FlowUnknown = "no-gauge" | "failed" | "missing" | "stale" | "not-measured-yet";

/**
 * A stretch's flow verdict for today:
 * - `ok`: the flow allows paddling.
 * - `low`: closed, the 72-hour mean is below the minimum (art. 6 §2).
 * - `high`: closed, the hourly flow measured at 08:00 is above the maximum
 *   (art. 6 §3; stands in for the official 08:00 forecast, which isn't public).
 * - `unknown`: see `FlowUnknown`.
 * - `not-checked`: no readings were asked for (yet).
 */
export type FlowVerdict =
  | { readonly kind: "ok" | "low" | "high"; readonly figures: FlowFigures }
  | { readonly kind: "unknown"; readonly why: FlowUnknown; readonly figures?: FlowFigures }
  | { readonly kind: "not-checked" };

const dateOf = (reading: FlowReading) => reading.at.slice(0, 10);
const hourOf = (reading: FlowReading) => reading.at.slice(11, 16);
const latestOf = (readings: readonly FlowReading[]) =>
  readings.reduce<FlowReading | undefined>((latest, r) => (!latest || r.at > latest.at ? r : latest), undefined);

/** The flow verdict of a Walloon stretch for today, from its gauge's readings (absent when not asked for). */
export function flowCheck(rule: AgwRule, readings: FlowReadings | undefined, today: CalendarDate): FlowVerdict {
  const { gauge, minM3s, maxM3s } = rule;
  if (!gauge) return { kind: "unknown", why: "no-gauge" };
  if (!readings) return { kind: "not-checked" };
  if (readings.status === "failed") return { kind: "unknown", why: "failed" };
  const series = readings.gauges[gauge.stationNo];
  const mean72h = series && latestOf(series.mean72h);
  const latest = series && latestOf(series.hourly);
  const at8 = series?.hourly.find((r) => dateOf(r) === today && hourOf(r) === "08:00");
  const figures: FlowFigures = {
    gauge,
    minM3s,
    maxM3s,
    ...(mean72h && { mean72h }),
    ...(at8 && { at8 }),
    ...(latest && { latest }),
  };
  if (!mean72h) return { kind: "unknown", why: "missing", figures };
  if (dateOf(mean72h) !== today) return { kind: "unknown", why: "stale", figures };
  if (minM3s !== null && mean72h.m3s < minM3s) return { kind: "low", figures };
  if (!at8) return { kind: "unknown", why: "not-measured-yet", figures };
  if (at8.m3s > maxM3s) return { kind: "high", figures };
  return { kind: "ok", figures };
}

/** The station numbers of every gauge in these rules, once each: what to ask the flow source for. */
export function gaugeStations(rules: readonly AgwRule[]): string[] {
  return [...new Set(rules.flatMap((rule) => (rule.gauge ? [rule.gauge.stationNo] : [])))].sort();
}
