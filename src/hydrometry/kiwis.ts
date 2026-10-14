// KiWIS adapter: implements the core's FlowSource with the SPW's public
// hydrometry service (ADR 0024, #61). The browser calls it directly (it allows
// any origin): one batched request resolves the series, one batched request
// reads their values, and the answer is cached for 15 minutes. It is the only
// module that talks to KiWIS. See docs/research/hydrometry.md.
import type { FlowReading, FlowReadings, FlowSource, GaugeReadings } from "@/core/flow";

export const KIWIS_URL = "https://hydrometrie.wallonie.be/services/KiWIS/KiWIS";

/** The two series per gauge (AGW art. 6): the daily 72-hour mean and the hourly mean discharge. */
export const MEAN_72H_SERIES = "34-Debit.3jMob.Moyen";
export const HOURLY_SERIES = "10-Debit.1h.Moyen";

/** How long an answer (or a failure) is reused: about 15 minutes (ADR 0024). */
export const CACHE_MS = 15 * 60 * 1000;

type Fetch = (input: string) => Promise<Response>;

export type KiwisOptions = {
  /** Injected for tests; defaults to the browser's fetch. */
  fetch?: Fetch;
  /** The clock, in milliseconds; injected for tests. */
  now?: () => number;
  serviceUrl?: string;
};

const FAILED: FlowReadings = { status: "failed" };

function query(serviceUrl: string, params: Record<string, string>): string {
  const base = { service: "kisters", type: "queryServices", datasource: "0", format: "json" };
  return `${serviceUrl}?${new URLSearchParams({ ...base, ...params }).toString()}`;
}

/** The request that resolves the two series of each gauge to their ids. */
export function seriesListUrl(stationNos: readonly string[], serviceUrl = KIWIS_URL): string {
  return query(serviceUrl, {
    request: "getTimeseriesList",
    station_no: stationNos.join(","),
    ts_name: `${MEAN_72H_SERIES},${HOURLY_SERIES}`,
    returnfields: "station_no,ts_id,ts_name",
  });
}

/** The request for the last day of values of these series. */
export function valuesUrl(tsIds: readonly string[], serviceUrl = KIWIS_URL): string {
  return query(serviceUrl, {
    request: "getTimeseriesValues",
    ts_id: tsIds.join(","),
    period: "P1D",
    returnfields: "Timestamp,Value",
  });
}

type Series = { stationNo: string; kind: keyof GaugeReadings };

/** The series list: a table whose first row names the columns. */
function parseSeriesList(body: unknown): Map<string, Series> | null {
  if (!Array.isArray(body) || !Array.isArray(body[0])) return null;
  const [header, ...rows] = body as unknown[][];
  const col = (name: string) => header.indexOf(name);
  const [station, id, name] = [col("station_no"), col("ts_id"), col("ts_name")];
  if (station < 0 || id < 0 || name < 0) return null;
  const series = new Map<string, Series>();
  for (const row of rows) {
    const kind = row[name] === MEAN_72H_SERIES ? "mean72h" : row[name] === HOURLY_SERIES ? "hourly" : null;
    if (kind && typeof row[id] === "string" && typeof row[station] === "string") {
      series.set(row[id], { stationNo: row[station], kind });
    }
  }
  return series;
}

type ValuesEntry = { ts_id?: unknown; columns?: unknown; data?: unknown };

/** The values: one entry per series, each with rows of [timestamp, value]. Null values are skipped. */
function parseValues(body: unknown, series: Map<string, Series>): Record<string, GaugeReadings> | null {
  if (!Array.isArray(body)) return null;
  const gauges: Record<string, { mean72h: FlowReading[]; hourly: FlowReading[] }> = {};
  for (const entry of body as ValuesEntry[]) {
    const which = typeof entry?.ts_id === "string" ? series.get(entry.ts_id) : undefined;
    if (!which || !Array.isArray(entry.data)) continue;
    const columns = typeof entry.columns === "string" ? entry.columns.split(",") : ["Timestamp", "Value"];
    const [at, value] = [columns.indexOf("Timestamp"), columns.indexOf("Value")];
    const readings = (entry.data as unknown[][]).flatMap((row): FlowReading[] =>
      typeof row?.[at] === "string" && typeof row[value] === "number" && Number.isFinite(row[value])
        ? [{ at: row[at], m3s: row[value] }]
        : [],
    );
    if (readings.length === 0) continue;
    const gauge = (gauges[which.stationNo] ??= { mean72h: [], hourly: [] });
    gauge[which.kind].push(...readings);
  }
  for (const gauge of Object.values(gauges)) {
    gauge.mean72h.sort((a, b) => (a.at < b.at ? -1 : 1));
    gauge.hourly.sort((a, b) => (a.at < b.at ? -1 : 1));
  }
  return gauges;
}

async function getJson(fetchFn: Fetch, url: string): Promise<unknown> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`KiWIS answered ${response.status}`);
  return JSON.parse(await response.text());
}

/**
 * The live flow source. At most two requests per refresh, and one refresh per
 * 15 minutes: a failure is cached too, so a failing service isn't asked again
 * and again. Concurrent callers share one refresh.
 */
export function createKiwisFlowSource(options: KiwisOptions = {}): FlowSource {
  const fetchFn: Fetch = options.fetch ?? ((input) => fetch(input));
  const now = options.now ?? (() => Date.now());
  const serviceUrl = options.serviceUrl ?? KIWIS_URL;
  const cache = new Map<string, { at: number; answer: Promise<FlowReadings> }>();

  async function load(stationNos: readonly string[]): Promise<FlowReadings> {
    try {
      const series = parseSeriesList(await getJson(fetchFn, seriesListUrl(stationNos, serviceUrl)));
      if (!series) return FAILED;
      // No series at all: every gauge is missing, and there are no values to ask for.
      if (series.size === 0) return { status: "ok", gauges: {} };
      const gauges = parseValues(await getJson(fetchFn, valuesUrl([...series.keys()], serviceUrl)), series);
      return gauges ? { status: "ok", gauges } : FAILED;
    } catch {
      return FAILED;
    }
  }

  return {
    readings(stationNos) {
      if (stationNos.length === 0) return Promise.resolve({ status: "ok", gauges: {} });
      const key = [...new Set(stationNos)].sort().join(",");
      const cached = cache.get(key);
      if (cached && now() - cached.at < CACHE_MS) return cached.answer;
      const answer = load(key.split(","));
      cache.set(key, { at: now(), answer });
      return answer;
    },
  };
}
