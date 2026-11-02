"use client";

import { useSyncExternalStore } from "react";

/**
 * How long a live answer stands: the 15-minute cache of the PKAYAK and KiWIS adapters (ADRs 0024,
 * 0035). They aren't imported for it, as they load lazily; a test keeps the three equal.
 */
export const REFRESH_MS = 15 * 60 * 1000;

/** Starts a timer and returns what cancels it. */
type SetTimer = (fire: () => void, ms: number) => () => void;

/** One answer for the whole page, kept fresh while anything wants it. */
export type LiveFeed<T> = {
  /** Wants the answer until the returned function is called. The listener hears of each new one. */
  subscribe: (listener: () => void) => () => void;
  /** The latest answer, undefined before the first. */
  answer: () => T | undefined;
};

export type LiveFeedOptions<T> = {
  /** How long after an answer to ask again. */
  everyMs: number;
  /** True for an answer that needs no further asking, such as a chunk that has loaded. */
  settled?: (answer: T) => boolean;
  /** Injected for tests. */
  setTimer?: SetTimer;
};

const browserTimer: SetTimer = (fire, ms) => {
  const timer = setTimeout(fire, ms);
  return () => clearTimeout(timer);
};

/**
 * A shared answer that `ask` gives: asked when first wanted and again `everyMs` after each
 * answer, and not at all while nothing wants it. Everything on the page sees the same answer,
 * so the map and the trip can't disagree. `ask` never rejects: a failure is an answer, which the
 * next ask can heal. How often the service itself is called is up to the source's cache.
 */
export function createLiveFeed<T>(ask: () => Promise<T>, options: LiveFeedOptions<T>): LiveFeed<T> {
  const { everyMs, settled, setTimer = browserTimer } = options;
  const listeners = new Set<() => void>();
  let latest: T | undefined;
  let cancelTimer = () => {};
  // Only the newest ask counts; stopping counts as one, so nothing comes of an ask still under way.
  let newestAsk = 0;

  function askNow() {
    const thisAsk = ++newestAsk;
    void ask().then((answer) => {
      if (thisAsk !== newestAsk) return;
      latest = answer;
      for (const listener of listeners) listener();
      if (!settled?.(answer)) cancelTimer = setTimer(askNow, everyMs);
    });
  }

  return {
    answer: () => latest,
    subscribe(listener) {
      listeners.add(listener);
      const alreadySettled = latest !== undefined && settled?.(latest);
      if (listeners.size === 1 && !alreadySettled) askNow();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        newestAsk++;
        cancelTimer();
      };
    },
  };
}

const noSubscription = () => () => {};
const noAnswer = () => undefined;

/** A feed's latest answer, kept fresh while `wanted`, which is what makes it ask. */
export function useLiveFeed<T>(feed: LiveFeed<T>, wanted: boolean): T | undefined {
  return useSyncExternalStore(wanted ? feed.subscribe : noSubscription, feed.answer, noAnswer);
}

/** Like `load`, but its result is kept. A failure isn't, so a later attempt loads again. */
export function keepOnSuccess<T>(load: () => Promise<T>): () => Promise<T> {
  let kept: Promise<T> | null = null;
  return () => {
    kept ??= load().catch((error: unknown) => {
      kept = null;
      throw error;
    });
    return kept;
  };
}
