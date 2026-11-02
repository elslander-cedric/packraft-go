"use client";

import type { AccessRules, AgwRule } from "@/core/access";
import { gaugeStations, type FlowReadings } from "@/core/flow";
import { REFRESH_MS, createLiveFeed, keepOnSuccess, useLiveFeed } from "./liveFeed";
import { builtInRulesChunk } from "./useAccessRules";

/** One flow source for the whole page, so the map and the trip share its 15-minute cache (ADR 0024). */
const flowSource = keepOnSuccess(() =>
  import("@/hydrometry/kiwis").then(({ createKiwisFlowSource }) => createKiwisFlowSource()),
);

/** The flows at every Walloon gauge. The adapter never throws, but a chunk can fail to load when offline: that is no answer either. */
async function askFlows(): Promise<FlowReadings> {
  try {
    const [source, { builtInAccessRules }] = await Promise.all([flowSource(), builtInRulesChunk()]);
    const agwRules = builtInAccessRules.records.flatMap(({ rule }) => (rule.type === "agw" ? [rule as AgwRule] : []));
    return await source.readings(gaugeStations(agwRules));
  } catch {
    return { status: "failed" };
  }
}

const flowsFeed = createLiveFeed(askFlows, { everyMs: REFRESH_MS });

/**
 * Today's live flows for the Walloon stretches' gauges (#61), asked for only while they are
 * wanted (something is shown for today) and the rules have loaded, and again every 15 minutes
 * while they are, so a failure heals. Undefined until they arrive.
 */
export function useWalloonFlows(rules: AccessRules | null, wanted: boolean): FlowReadings | undefined {
  return useLiveFeed(flowsFeed, wanted && rules !== null);
}
