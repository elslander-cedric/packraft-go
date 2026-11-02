"use client";

import type { AccessRules } from "@/core/access";
import type { OfficialIncidents } from "@/core/incident";
import type { OfficialReadings, OfficialStatusSource } from "@/core/officialStatus";
import { REFRESH_MS, createLiveFeed, keepOnSuccess, useLiveFeed, type LiveFeed } from "./liveFeed";

const FAILED = { status: "failed" } as const;

/** One official status source for the whole page, so the map and the trip share its 15-minute cache (ADR 0035). */
const statusSource = keepOnSuccess(() =>
  import("@/kayak/pkayak").then(({ createPkayakStatusSource }) => createPkayakStatusSource()),
);

/**
 * One of the source's answers, for the whole page. The adapter never throws, but its chunk
 * can fail to load when offline: that is no answer either.
 */
function officialFeed<T>(ask: (source: OfficialStatusSource) => Promise<T>) {
  return createLiveFeed<T | typeof FAILED>(() => statusSource().then(ask).catch(() => FAILED), { everyMs: REFRESH_MS });
}

const readingsFeed = officialFeed((source) => source.readings());
const incidentsFeed = officialFeed((source) => source.incidents());

/** A feed's answer while it's wanted and the rules that use it have loaded; undefined until it arrives, and otherwise. */
function useOfficialAnswer<T>(feed: LiveFeed<T>, rules: AccessRules | null, wanted: boolean): T | undefined {
  const asking = wanted && rules !== null;
  const answer = useLiveFeed(feed, asking);
  return asking ? answer : undefined;
}

/**
 * Today's official status (#210), asked for only while it is wanted (something is
 * shown for today, or for a future date, which notes a closure today, #212), and again
 * every 15 minutes while it is, so a failure heals and a page left open doesn't go stale.
 */
export function useOfficialStatus(rules: AccessRules | null, wanted: boolean): OfficialReadings | undefined {
  return useOfficialAnswer(readingsFeed, rules, wanted);
}

/**
 * Today's incidents (#216), from the same refresh as the official status when both are
 * wanted. Undefined until they arrive, and while they aren't wanted: the map on a past date
 * neither shows them nor says they failed, whatever the trip has asked for.
 */
export function useOfficialIncidents(rules: AccessRules | null, wanted: boolean): OfficialIncidents | undefined {
  return useOfficialAnswer(incidentsFeed, rules, wanted);
}
