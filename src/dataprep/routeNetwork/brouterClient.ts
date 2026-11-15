// Polite BRouter client for the route network script (ADR 0039): one request at a time with a
// pause between them, identified by the project URL only, every answer (no-route ones too)
// cached by its URL so a re-run only asks for what's missing. Never used by the app.
// Network, clock and cache are injected so the script supplies the real ones, tests fakes.
import { OVERPASS_USER_AGENT } from "../walloonStretches/overpass";
import type { BRouterAnswer } from "./walking";

/** Minimum pause between two live requests: the free community server answers 403 to faster runs. */
export const BROUTER_MIN_INTERVAL_MS = 6000;
/** Pause before retrying a busy or failing server. */
const RETRY_PAUSE_MS = 120_000;
const MAX_ATTEMPTS = 4;

export type BRouterClientDeps = {
  fetch: (
    url: string,
    init: { headers: Record<string, string> },
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  /** Keyed by the request URL; the value is the answer as JSON. */
  cache: {
    read: (url: string) => Promise<string | undefined>;
    write: (url: string, value: string) => Promise<void>;
  };
  log?: (message: string) => void;
};

/** 200 is a route, 400 is BRouter's "no route here"; anything else is the server failing. */
const settled = (status: number) => status === 200 || status === 400;

export function createBRouterClient(deps: BRouterClientDeps) {
  let lastRequestAt: number | undefined;

  async function ask(url: string): Promise<BRouterAnswer | string> {
    if (lastRequestAt !== undefined) {
      const elapsed = deps.now() - lastRequestAt;
      if (elapsed < BROUTER_MIN_INTERVAL_MS) {
        await deps.wait(BROUTER_MIN_INTERVAL_MS - elapsed);
      }
    }
    lastRequestAt = deps.now();
    try {
      const response = await deps.fetch(url, {
        headers: { "User-Agent": OVERPASS_USER_AGENT },
      });
      const body = await response.text();
      return settled(response.status)
        ? { status: response.status, body }
        : `HTTP ${response.status}: ${body.slice(0, 200)}`;
    } catch (error) {
      return String(error);
    }
  }

  return {
    async answer(url: string): Promise<BRouterAnswer> {
      const cached = await deps.cache.read(url);
      if (cached !== undefined) {
        return JSON.parse(cached);
      }
      let lastError = "";
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (i > 0) {
          deps.log?.(
            `BRouter failed (${lastError.slice(0, 80)}); retrying in ${RETRY_PAUSE_MS / 1000} s`,
          );
          await deps.wait(RETRY_PAUSE_MS);
        }
        const outcome = await ask(url);
        if (typeof outcome !== "string") {
          await deps.cache.write(url, JSON.stringify(outcome));
          return outcome;
        }
        lastError = outcome;
      }
      throw new Error(
        `BRouter failed ${MAX_ATTEMPTS} times for ${url}: ${lastError}`,
      );
    },
  };
}
