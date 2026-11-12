"use client";

import type { AccessRules, LockMarker } from "@/core/access";
import type { CalendarDate } from "@/core/calendarDate";
import type { Obstacle } from "@/core/obstacle";
import type { OfficialAire, OfficialStretch } from "@/core/officialAire";
import { createLiveFeed, keepOnSuccess, useLiveFeed } from "./liveFeed";

/** Today's local date, YYYY-MM-DD (the planner's own calendar day, not UTC's). */
export function localToday(): CalendarDate {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** How long after a failed chunk load to try again: soon, as it only takes signal. */
const CHUNK_RETRY_MS = 60 * 1000;

/** The rules' chunk, shared with what else needs them. A failed load isn't kept, so it can be retried. */
export const builtInRulesChunk = keepOnSuccess(() => import("@/access/builtInRules"));
const officialAiresChunk = keepOnSuccess(() => import("@/access/builtInOfficialAires"));

type RulesChunk = typeof import("@/access/builtInRules");
type AiresChunk = typeof import("@/access/builtInOfficialAires");

/** Something built in, one for the page, asked for until its chunk has loaded. */
function builtInFeed<Chunk, T>(chunk: () => Promise<Chunk>, pick: (loaded: Chunk) => T, unavailable: T) {
  return createLiveFeed(() => chunk().then(pick).catch(() => unavailable), {
    everyMs: CHUNK_RETRY_MS,
    settled: (answer) => answer !== unavailable,
  });
}

/**
 * No rules, for while their chunk can't be loaded: a status reads unknown rather than checking
 * for ever. Unknown is what the app says with no data (GLOSSARY: Access status).
 */
const NO_RULES: AccessRules = { records: [] };

export type BuiltInOfficialAires = {
  readonly aires: readonly OfficialAire[];
  readonly stretches: readonly OfficialStretch[];
};

const rulesFeed = builtInFeed<RulesChunk, AccessRules>(builtInRulesChunk, ({ builtInAccessRules }) => builtInAccessRules, NO_RULES);
const locksFeed = builtInFeed<RulesChunk, readonly LockMarker[] | null>(builtInRulesChunk, ({ builtInLocks }) => builtInLocks.locks, null);
const obstaclesFeed = builtInFeed<RulesChunk, readonly Obstacle[] | null>(builtInRulesChunk, ({ builtInObstacles }) => builtInObstacles, null);
const officialAiresFeed = builtInFeed<AiresChunk, BuiltInOfficialAires | null>(
  officialAiresChunk,
  ({ builtInOfficialAires, builtInOfficialStretches }) => ({
    aires: builtInOfficialAires,
    stretches: builtInOfficialStretches.stretches,
  }),
  null,
);

/**
 * The built-in access rules, loaded the first time they are wanted (the access
 * layer is switched on, or the trip has a paddle leg), so the page itself stays light.
 */
export function useAccessRules(wanted: boolean): AccessRules | null {
  return useLiveFeed(rulesFeed, wanted) ?? null;
}

/** The built-in lock markers of Flanders and Brussels, loaded the first time they are wanted. */
export function useBuiltInLocks(wanted: boolean): readonly LockMarker[] | null {
  return useLiveFeed(locksFeed, wanted) ?? null;
}

/** The built-in obstacles (ADR 0035), loaded the first time they are wanted. */
export function useBuiltInObstacles(wanted: boolean): readonly Obstacle[] | null {
  return useLiveFeed(obstaclesFeed, wanted) ?? null;
}

/** The built-in official aires and stretches (ADR 0035), loaded the first time they are wanted. */
export function useBuiltInOfficialAires(wanted: boolean): BuiltInOfficialAires | null {
  return useLiveFeed(officialAiresFeed, wanted) ?? null;
}
