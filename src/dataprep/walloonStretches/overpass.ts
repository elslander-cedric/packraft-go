// Polite Overpass client for the offline stretch preparation script (ADR 0024).
// Never used by the app at runtime. Network, clock and cache are injected so the
// script (scripts/walloon-stretches.mts) supplies the real ones and tests supply fakes;
// the cache is keyed by the query text.
import { cachedOrRetried, pacer, SCRIPT_USER_AGENT, type Attempt, type PoliteDeps } from "../politeRequests";

/** Minimum pause between two live requests. */
export const OVERPASS_MIN_INTERVAL_MS = 1100;
/** Pause before retrying a busy or failing server. */
export const OVERPASS_RETRY_PAUSE_MS = 15_000;
const MAX_ATTEMPTS = 4;

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  /** A way's node ids, in order (with `out geom`, beside its geometry). */
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number } | null>;
};
export type OverpassResult = { elements: OverpassElement[] };

export type OverpassDeps = PoliteDeps & {
  endpoint: string;
  fetch: (
    url: string,
    init: { method: "POST"; headers: Record<string, string>; body: string },
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  /** Pause before retrying, for heavy queries to a busy server; `OVERPASS_RETRY_PAUSE_MS` by default. */
  retryPauseMs?: number;
};

export function createOverpassClient(deps: OverpassDeps) {
  const politely = pacer(deps, OVERPASS_MIN_INTERVAL_MS);

  async function attempt(query: string): Promise<Attempt<OverpassResult>> {
    await politely();
    const response = await deps.fetch(deps.endpoint, {
      method: "POST",
      headers: { "User-Agent": SCRIPT_USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    const body = await response.text();
    if (response.status !== 200) return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
    let result: OverpassResult & { remark?: string };
    try {
      result = JSON.parse(body);
    } catch {
      return { ok: false, error: `not JSON: ${body.slice(0, 200)}` };
    }
    if (typeof result.remark === "string" && /error/i.test(result.remark)) return { ok: false, error: result.remark };
    if (!Array.isArray(result.elements)) return { ok: false, error: "no elements in the answer" };
    return { ok: true, value: { elements: result.elements }, cached: body };
  }

  return {
    query: (query: string): Promise<OverpassResult> =>
      cachedOrRetried(deps, {
        service: "Overpass",
        key: query,
        fromCache: (cached) => ({ elements: JSON.parse(cached).elements }),
        attempt: () => attempt(query),
        maxAttempts: MAX_ATTEMPTS,
        retryPauseMs: deps.retryPauseMs ?? OVERPASS_RETRY_PAUSE_MS,
      }),
  };
}
