"use client";

import { useEffect, useState } from "react";
import type { AccessRules } from "@/core/access";
import type { OfficialIncidents } from "@/core/incident";
import type { OfficialReadings, OfficialStatusSource } from "@/core/officialStatus";

/** One official status source for the whole page, so the map and the trip share its 15-minute cache (ADR 0035). */
let shared: Promise<OfficialStatusSource> | null = null;
function statusSource(): Promise<OfficialStatusSource> {
  shared ??= import("@/kayak/pkayak").then(({ createPkayakStatusSource }) => createPkayakStatusSource());
  return shared;
}

/**
 * Today's official status (#210), asked for only while it is wanted (something is
 * shown for today, or for a future date, which notes a closure today, #212) and the
 * rules that use it have loaded. Undefined until it arrives.
 */
export function useOfficialStatus(rules: AccessRules | null, wanted: boolean): OfficialReadings | undefined {
  const [official, setOfficial] = useState<OfficialReadings | undefined>(undefined);
  const loaded = rules !== null;
  useEffect(() => {
    if (!wanted || !loaded) return;
    let cancelled = false;
    void statusSource()
      .then((source) => source.readings())
      // The adapter never throws, but its chunk can fail to load when offline: that is no reading either.
      .catch((): OfficialReadings => ({ status: "failed" }))
      .then((readings) => {
        if (!cancelled) setOfficial(readings);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, loaded]);
  return official;
}

/**
 * Today's incidents (#216), from the same refresh as the official status, wanted on the
 * same terms. Undefined until they arrive, and while they aren't wanted: a past date
 * neither shows them nor says they failed.
 */
export function useOfficialIncidents(rules: AccessRules | null, wanted: boolean): OfficialIncidents | undefined {
  const [incidents, setIncidents] = useState<OfficialIncidents | undefined>(undefined);
  const loaded = rules !== null;
  useEffect(() => {
    if (!wanted || !loaded) return;
    let cancelled = false;
    void statusSource()
      .then((source) => source.incidents())
      .catch((): OfficialIncidents => ({ status: "failed" }))
      .then((answer) => {
        if (!cancelled) setIncidents(answer);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, loaded]);
  return wanted ? incidents : undefined;
}
