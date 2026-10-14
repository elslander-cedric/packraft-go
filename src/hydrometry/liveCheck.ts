// Live KiWIS check (issue #64): compares what the SPW's hydrometry service answers
// today with the recorded fixtures our tests replay, so we notice when the service
// changes its table layout, series names or timestamp offset. Run by hand with
// `npm run check:kiwis`; never part of `npm test`, `npm run e2e` or CI (ADR 0019).
// Nothing here writes fixtures: re-recording stays a deliberate step.
import type { Finding, FindingLevel, RecordedResponse } from "@/routing/liveCheck";
import { HOURLY_SERIES, MEAN_72H_SERIES, createKiwisFlowSource, seriesListUrl, valuesUrl } from "./kiwis";

/** The answers of the two requests the app makes per refresh. */
export type KiwisAnswers = { list: RecordedResponse; values: RecordedResponse };

/** Pause between two requests to the public service. */
export const KIWIS_CHECK_DELAY_MS = 2000;

/** Who is asking: the project URL only, never a personal email. */
export const KIWIS_CHECK_USER_AGENT = "packraft-go-kiwis-check (+https://github.com/elslander-cedric/packraft-go)";

type Report = Record<FindingLevel, (message: string) => void>;

/** Share of series that may come and go before we call it drift. */
const SERIES_COUNT_TOLERANCE = 0.2;

/** The Brussels UTC offset at an instant, in minutes (+60 in winter, +120 in summer). */
export function brusselsOffsetMinutes(instant: Date): number {
  const part = new Intl.DateTimeFormat("en", { timeZone: "Europe/Brussels", timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(part ?? "");
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?([+-]\d\d:\d\d|Z)$/;

/**
 * Whether a timestamp is written in Brussels local time: it carries an offset, and
 * that offset is the one Brussels has at that instant. The app reads the date and
 * the hour straight from the text (the 08:00 reading), so this is what it relies on.
 */
export function isBrusselsLocalTimestamp(at: string): boolean {
  const m = TIMESTAMP.exec(at);
  if (!m || m[1] === "Z") return false;
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) return false;
  const sign = m[1][0] === "-" ? -1 : 1;
  return sign * (Number(m[1].slice(1, 3)) * 60 + Number(m[1].slice(4, 6))) === brusselsOffsetMinutes(instant);
}

type Series = { stationNo: string; name: string; id: string };

/** The series list as a table with a header row, or why it is not one. */
export function readSeriesList(body: string): Series[] | string {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return "series list is not JSON";
  }
  if (!Array.isArray(json) || !Array.isArray(json[0])) return "series list is not a table (array of rows)";
  const [header, ...rows] = json as unknown[][];
  const [station, id, name] = ["station_no", "ts_id", "ts_name"].map((c) => header.indexOf(c));
  if (station < 0 || id < 0 || name < 0) {
    return `series list header lacks station_no, ts_id or ts_name (got ${JSON.stringify(header)})`;
  }
  const series: Series[] = [];
  for (const row of rows) {
    if (Array.isArray(row) && [station, id, name].every((i) => typeof row[i] === "string")) {
      series.push({ stationNo: row[station] as string, id: row[id] as string, name: row[name] as string });
    }
  }
  return series;
}

type Entry = { ts_id: string; columns: string; data: [string, number | null][] };

/** The values answer as one entry per series, or why it is not. */
export function readValues(body: string): Entry[] | string {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return "values answer is not JSON";
  }
  if (!Array.isArray(json)) return "values answer is not an array of series";
  for (const entry of json as Record<string, unknown>[]) {
    if (typeof entry?.ts_id !== "string") return "a values entry has no ts_id";
    if (entry.columns !== "Timestamp,Value") {
      return `values columns are ${JSON.stringify(entry.columns)}, expected "Timestamp,Value"`;
    }
    if (!Array.isArray(entry.data)) return `values entry ${entry.ts_id} has no data array`;
    const bad = entry.data.find(
      (r) => !Array.isArray(r) || typeof r[0] !== "string" || !(typeof r[1] === "number" || r[1] === null),
    );
    if (bad !== undefined) return `a row of ${entry.ts_id} is not [timestamp, number]: ${JSON.stringify(bad)}`;
  }
  return json as Entry[];
}

const countBy = (series: Series[], name: string) => series.filter((s) => s.name === name).length;
const withinShare = (value: number, reference: number, share: number) =>
  Math.abs(value - reference) <= Math.abs(reference) * share;

function compareList(live: Series[], recorded: Series[], report: Report) {
  report.match("series list is a table with station_no, ts_id and ts_name");
  for (const name of [MEAN_72H_SERIES, HOURLY_SERIES]) {
    const [l, r] = [countBy(live, name), countBy(recorded, name)];
    if (l === 0) report.mismatch(`no "${name}" series any more (fixture: ${r})`);
    else if (withinShare(l, r, SERIES_COUNT_TOLERANCE)) report.match(`${l} "${name}" series (fixture: ${r})`);
    else report.drift(`${l} "${name}" series, fixture has ${r}`);
  }
  const liveStations = new Set(live.map((s) => s.stationNo));
  const lost = [...new Set(recorded.map((s) => s.stationNo))].filter((s) => !liveStations.has(s));
  if (lost.length > 0) report.drift(`gauges without series now: ${lost.join(", ")}`);
  const liveIds = new Map(live.map((s) => [`${s.stationNo}/${s.name}`, s.id]));
  const moved = recorded.filter((s) => {
    const id = liveIds.get(`${s.stationNo}/${s.name}`);
    return id !== undefined && id !== s.id;
  });
  if (moved.length > 0) report.drift(`${moved.length} series have a new ts_id (the app resolves ids at run time, so this is harmless)`);
}

function compareValues(live: Entry[], liveList: Series[], recorded: Entry[], report: Report) {
  report.match(`values answer: ${live.length} series with columns "Timestamp,Value" (fixture: ${recorded.length})`);
  const nameOf = new Map(liveList.map((s) => [s.id, s.name]));
  const stamps = live.flatMap((e) => e.data.map(([at]) => ({ at, name: nameOf.get(e.ts_id) })));
  if (stamps.length === 0) {
    report.mismatch("values answer holds no readings at all");
    return;
  }

  const notBrussels = stamps.filter((s) => !isBrusselsLocalTimestamp(s.at));
  if (notBrussels.length > 0) {
    report.mismatch(
      `${notBrussels.length} of ${stamps.length} timestamps are not Brussels local time with its offset (e.g. ${JSON.stringify(notBrussels[0].at)}); the 08:00 reading would be picked wrongly`,
    );
  } else {
    report.match("timestamps are Brussels local time with their offset (+01:00 / +02:00)");
  }

  const hourly = stamps.filter((s) => s.name === HOURLY_SERIES);
  const offHour = hourly.filter((s) => s.at.slice(14, 16) !== "00");
  if (hourly.length === 0) report.drift("no hourly readings in the values answer");
  else if (offHour.length > 0) {
    report.mismatch(`hourly readings not on the hour, e.g. ${JSON.stringify(offHour[0].at)}; the 08:00 reading would be missed`);
  } else report.match("hourly readings are stamped on the hour");

  const mean = stamps.filter((s) => s.name === MEAN_72H_SERIES);
  if (mean.length === 0) report.drift("no 72-hour mean readings in the values answer");
  else if (mean.every((s) => s.at.slice(11, 16) === "01:00")) report.match("72-hour means are stamped 01:00, as recorded");
  else report.drift("72-hour means are no longer all stamped 01:00");
}

/** Compares the live answers with the recorded ones, finding by finding. */
export async function compareWithFixture(live: KiwisAnswers, recorded: KiwisAnswers): Promise<Finding[]> {
  const findings: Finding[] = [];
  const report: Report = {
    match: (message) => findings.push({ level: "match", message }),
    drift: (message) => findings.push({ level: "drift", message }),
    mismatch: (message) => findings.push({ level: "mismatch", message }),
  };

  for (const [name, l, r] of [
    ["series list", live.list, recorded.list],
    ["values", live.values, recorded.values],
  ] as const) {
    if (l.status === r.status) report.match(`${name}: HTTP status ${l.status}`);
    else report.mismatch(`${name}: HTTP status ${l.status}, fixture has ${r.status}`);
  }

  const recordedList = readSeriesList(recorded.list.body);
  const recordedValues = readValues(recorded.values.body);
  if (typeof recordedList === "string" || typeof recordedValues === "string") {
    const why = typeof recordedList === "string" ? recordedList : (recordedValues as string);
    throw new Error(`recorded fixture is not a KiWIS answer: ${why}`);
  }
  const liveList = live.list.status === 200 ? readSeriesList(live.list.body) : "series list was not answered with 200";
  if (typeof liveList === "string") {
    report.mismatch(liveList);
  } else {
    compareList(liveList, recordedList, report);
    const liveValues = live.values.status === 200 ? readValues(live.values.body) : "values were not answered with 200";
    if (typeof liveValues === "string") report.mismatch(liveValues);
    else compareValues(liveValues, liveList, recordedValues, report);
  }

  const [liveOutcome, recordedOutcome] = await Promise.all([adapterOutcome(live), adapterOutcome(recorded)]);
  if (liveOutcome === recordedOutcome) report.match(`adapter outcome: ${liveOutcome}`);
  else report.mismatch(`adapter outcome: ${liveOutcome}, fixture gives ${recordedOutcome}`);
  return findings;
}

/** What the app's KiWIS adapter makes of these answers: `ok`, `ok but no gauge has readings`, or `failed`. */
async function adapterOutcome(answers: KiwisAnswers): Promise<string> {
  const list = readSeriesList(answers.list.body);
  const stations = typeof list === "string" ? ["unknown"] : [...new Set(list.map((s) => s.stationNo))];
  const source = createKiwisFlowSource({
    fetch: async (url) => {
      const reply = new URL(url).searchParams.get("request") === "getTimeseriesList" ? answers.list : answers.values;
      return new Response(reply.body, { status: reply.status });
    },
  });
  const result = await source.readings(stations);
  if (result.status === "failed") return "failed";
  return Object.keys(result.gauges).length > 0 ? "ok" : "ok but no gauge has readings";
}

export type KiwisCheckDeps = {
  fetch: (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
  wait: (ms: number) => Promise<void>;
  /** Reads a file from `src/hydrometry/fixtures/`. */
  readFixture: (name: string) => string;
};

export type KiwisCheckResult = { passed: boolean; report: string };

/** Two requests, one at a time, no retries: the same two the app makes for the 21 recorded gauges. */
export async function runKiwisCheck(deps: KiwisCheckDeps): Promise<KiwisCheckResult> {
  const recorded: KiwisAnswers = {
    list: { status: 200, body: deps.readFixture("timeseries-list.json") },
    values: { status: 200, body: deps.readFixture("timeseries-values.json") },
  };
  const recordedList = readSeriesList(recorded.list.body);
  if (typeof recordedList === "string") throw new Error(`recorded fixture is not a KiWIS answer: ${recordedList}`);
  const stations = [...new Set(recordedList.map((s) => s.stationNo))];

  const ask = async (url: string): Promise<RecordedResponse> => {
    const response = await deps.fetch(url, { headers: { "User-Agent": KIWIS_CHECK_USER_AGENT } });
    return { status: response.status, body: await response.text() };
  };

  const listUrl = seriesListUrl(stations);
  let valuesRequest = "(not requested)";
  let findings: Finding[];
  try {
    const list = await ask(listUrl);
    const liveList = list.status === 200 ? readSeriesList(list.body) : [];
    const ids = typeof liveList === "string" ? [] : liveList.map((s) => s.id);
    let values: RecordedResponse = { status: 0, body: "[]" };
    if (ids.length > 0) {
      await deps.wait(KIWIS_CHECK_DELAY_MS);
      valuesRequest = valuesUrl(ids);
      values = await ask(valuesRequest);
    }
    findings = await compareWithFixture({ list, values }, recorded);
  } catch (error) {
    findings = [{ level: "mismatch", message: `request failed: ${error instanceof Error ? error.message : String(error)}` }];
  }

  const lines = ["", "getTimeseriesList + getTimeseriesValues (timeseries-list.json, timeseries-values.json)", `  ${listUrl}`, `  ${valuesRequest}`];
  for (const finding of findings) lines.push(`  ${finding.level.toUpperCase().padEnd(8)} ${finding.message}`);
  const mismatches = findings.filter((f) => f.level === "mismatch").length;
  const drifts = findings.filter((f) => f.level === "drift").length;

  lines.push("");
  if (mismatches > 0) lines.push(`FAILED: ${mismatches} mismatch(es). The live service no longer answers the way the KiWIS adapter expects.`);
  else if (drifts > 0) lines.push(`PASSED with ${drifts} drift(s): the adapter still copes, but consider re-recording the fixtures.`);
  else lines.push("PASSED: the live service still matches the recorded fixtures.");
  return { passed: mismatches === 0, report: lines.join("\n") };
}
