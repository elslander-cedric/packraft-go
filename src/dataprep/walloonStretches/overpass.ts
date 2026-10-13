// Polite Overpass client for the offline stretch preparation script (#54, ADR 0024).
// Never used by the app at runtime. Network, clock and cache are injected so the
// script (scripts/walloon-stretches.mts) supplies the real ones and tests supply fakes.

/** Identifies the project only. Never put a personal email here. */
export const OVERPASS_USER_AGENT = "packraft-go (+https://github.com/elslander-cedric/packraft-go)";

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
  geometry?: Array<{ lat: number; lon: number } | null>;
};
export type OverpassResult = { elements: OverpassElement[] };

export type OverpassDeps = {
  endpoint: string;
  fetch: (
    url: string,
    init: { method: "POST"; headers: Record<string, string>; body: string },
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  /** Keyed by the query text. */
  cache: { read: (key: string) => Promise<string | undefined>; write: (key: string, value: string) => Promise<void> };
  log?: (message: string) => void;
};

export function createOverpassClient(deps: OverpassDeps) {
  let lastRequestAt: number | undefined;

  async function politely() {
    if (lastRequestAt !== undefined) {
      const elapsed = deps.now() - lastRequestAt;
      if (elapsed < OVERPASS_MIN_INTERVAL_MS) await deps.wait(OVERPASS_MIN_INTERVAL_MS - elapsed);
    }
    lastRequestAt = deps.now();
  }

  async function attempt(query: string): Promise<{ ok: true; body: string; result: OverpassResult } | { ok: false; error: string }> {
    await politely();
    const response = await deps.fetch(deps.endpoint, {
      method: "POST",
      headers: { "User-Agent": OVERPASS_USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
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
    return { ok: true, body, result: { elements: result.elements } };
  }

  return {
    async query(query: string): Promise<OverpassResult> {
      const cached = await deps.cache.read(query);
      if (cached !== undefined) return { elements: JSON.parse(cached).elements };
      let lastError = "";
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (i > 0) {
          deps.log?.(`Overpass failed (${lastError.slice(0, 80)}); retrying in ${OVERPASS_RETRY_PAUSE_MS / 1000} s`);
          await deps.wait(OVERPASS_RETRY_PAUSE_MS);
        }
        const outcome = await attempt(query);
        if (outcome.ok) {
          await deps.cache.write(query, outcome.body);
          return outcome.result;
        }
        lastError = outcome.error;
      }
      throw new Error(`Overpass request failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
    },
  };
}
