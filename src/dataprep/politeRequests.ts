// What the offline preparation scripts' clients of free public services share: they say who
// they are, wait between requests, cache every answer and retry a failing server a few times.
// Never used by the app. The clock and cache are injected so scripts supply the real ones,
// tests fakes.

/** Identifies the project only. Never put a personal email here. */
export const SCRIPT_USER_AGENT = "packraft-go (+https://github.com/elslander-cedric/packraft-go)";

export type PoliteDeps = {
  wait: (ms: number) => Promise<void>;
  now: () => number;
  cache: {
    read: (key: string) => Promise<string | undefined>;
    write: (key: string, value: string) => Promise<void>;
  };
  log?: (message: string) => void;
};

/** One request: its answer and the text to cache, or why it failed (worth retrying). */
export type Attempt<T> = { ok: true; value: T; cached: string } | { ok: false; error: string };

/** A function to call before each request: it waits until `minIntervalMs` since the last. */
export function pacer({ wait, now }: PoliteDeps, minIntervalMs: number): () => Promise<void> {
  let lastRequestAt: number | undefined;
  return async () => {
    if (lastRequestAt !== undefined) {
      const elapsed = now() - lastRequestAt;
      if (elapsed < minIntervalMs) {
        await wait(minIntervalMs - elapsed);
      }
    }
    lastRequestAt = now();
  };
}

type Retried<T> = {
  /** Names the service in log lines and the final error. */
  readonly service: string;
  readonly key: string;
  readonly fromCache: (cached: string) => T;
  readonly attempt: () => Promise<Attempt<T>>;
  readonly maxAttempts: number;
  readonly retryPauseMs: number;
};

/** The cached answer for `key`, or the first successful of up to `maxAttempts` requests, then cached. */
export async function cachedOrRetried<T>(deps: PoliteDeps, request: Retried<T>): Promise<T> {
  const { service, key, fromCache, attempt, maxAttempts, retryPauseMs } = request;
  const cached = await deps.cache.read(key);
  if (cached !== undefined) {
    return fromCache(cached);
  }
  let lastError = "";
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      deps.log?.(`${service} failed (${lastError.slice(0, 80)}); retrying in ${retryPauseMs / 1000} s`);
      await deps.wait(retryPauseMs);
    }
    const outcome = await attempt();
    if (outcome.ok) {
      await deps.cache.write(key, outcome.cached);
      return outcome.value;
    }
    lastError = outcome.error;
  }
  throw new Error(`${service} failed ${maxAttempts} times for ${key}: ${lastError}`);
}
