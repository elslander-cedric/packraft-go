// Polite BRouter client for the route network script (ADR 0039): one request at a time with a
// pause between them, identified by the project URL only, every answer (no-route ones too)
// cached by its URL so a re-run only asks for what's missing. Never used by the app.
// Network, clock and cache are injected so the script supplies the real ones, tests fakes.
import { z } from "zod";
import { cachedOrRetried, pacer, SCRIPT_USER_AGENT, type Attempt, type PoliteDeps } from "../politeRequests";
import type { BRouterAnswer } from "./walking";

/** Minimum pause between two live requests: the free community server answers 403 to faster runs. */
export const BROUTER_MIN_INTERVAL_MS = 6000;
/** Pause before retrying a busy or failing server. */
const RETRY_PAUSE_MS = 120_000;
const MAX_ATTEMPTS = 4;

export type BRouterClientDeps = PoliteDeps & {
  fetch: (
    url: string,
    init: { headers: Record<string, string> },
  ) => Promise<{ status: number; text: () => Promise<string> }>;
};

/** A cached answer, as `answer` writes it. */
const cachedAnswerSchema = z.object({ status: z.number(), body: z.string() });

/** 200 is a route, 400 is BRouter's "no route here"; anything else is the server failing. */
const settled = (status: number) => status === 200 || status === 400;

export function createBRouterClient(deps: BRouterClientDeps) {
  const politely = pacer(deps, BROUTER_MIN_INTERVAL_MS);

  async function attempt(url: string): Promise<Attempt<BRouterAnswer>> {
    await politely();
    try {
      const response = await deps.fetch(url, {
        headers: { "User-Agent": SCRIPT_USER_AGENT },
      });
      const body = await response.text();
      if (!settled(response.status)) {
        return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
      }
      const answer = { status: response.status, body };
      return { ok: true, value: answer, cached: JSON.stringify(answer) };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  return {
    answer: (url: string): Promise<BRouterAnswer> =>
      cachedOrRetried(deps, {
        service: "BRouter",
        key: url,
        fromCache: (cached) => cachedAnswerSchema.parse(JSON.parse(cached)),
        attempt: () => attempt(url),
        maxAttempts: MAX_ATTEMPTS,
        retryPauseMs: RETRY_PAUSE_MS,
      }),
  };
}
