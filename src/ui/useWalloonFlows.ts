"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccessRules, AgwRule } from "@/core/access";
import { gaugeStations, type FlowReadings, type FlowSource } from "@/core/flow";

/** One flow source for the whole page, so the map and the trip share its 15-minute cache (ADR 0024). */
let shared: Promise<FlowSource> | null = null;
function flowSource(): Promise<FlowSource> {
  shared ??= import("@/hydrometry/kiwis").then(({ createKiwisFlowSource }) => createKiwisFlowSource());
  return shared;
}

/**
 * Today's live flows for the Walloon stretches' gauges (#61), asked for only
 * while they are wanted (something is shown for today). Undefined until they arrive.
 */
export function useWalloonFlows(rules: AccessRules | null, wanted: boolean): FlowReadings | undefined {
  const [flows, setFlows] = useState<FlowReadings | undefined>(undefined);
  const stations = useMemo(
    () =>
      rules
        ? gaugeStations(rules.records.flatMap((record) => (record.rule.type === "agw" ? [record.rule as AgwRule] : [])))
        : [],
    [rules],
  );
  useEffect(() => {
    if (!wanted || stations.length === 0) return;
    let cancelled = false;
    void flowSource()
      .then((source) => source.readings(stations))
      .then((readings) => {
        if (!cancelled) setFlows(readings);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, stations]);
  return flows;
}
