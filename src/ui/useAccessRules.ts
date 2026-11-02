"use client";

import { useEffect, useState } from "react";
import type { AccessRules, LockMarker } from "@/core/access";
import type { CalendarDate } from "@/core/calendarDate";
import type { Obstacle } from "@/core/obstacle";
import type { OfficialAire, OfficialStretch } from "@/core/officialAire";

/** Today's local date, YYYY-MM-DD (the planner's own calendar day, not UTC's). */
export function localToday(): CalendarDate {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * The built-in access rules, loaded the first time they are wanted (the access
 * layer is switched on, or the trip has a paddle leg), so the page itself stays light.
 */
export function useAccessRules(wanted: boolean): AccessRules | null {
  const [rules, setRules] = useState<AccessRules | null>(null);
  useEffect(() => {
    if (!wanted || rules) return;
    let cancelled = false;
    void import("@/access/builtInRules").then(({ builtInAccessRules }) => {
      if (!cancelled) setRules(builtInAccessRules);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, rules]);
  return rules;
}

/** The built-in lock markers of Flanders and Brussels (#57), loaded the first time they are wanted. */
export function useBuiltInLocks(wanted: boolean): readonly LockMarker[] | null {
  const [locks, setLocks] = useState<readonly LockMarker[] | null>(null);
  useEffect(() => {
    if (!wanted || locks) return;
    let cancelled = false;
    void import("@/access/builtInRules").then(({ builtInLocks }) => {
      if (!cancelled) setLocks(builtInLocks.locks);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, locks]);
  return locks;
}

/** The built-in obstacles (ADR 0035), loaded the first time they are wanted. */
export function useBuiltInObstacles(wanted: boolean): readonly Obstacle[] | null {
  const [obstacles, setObstacles] = useState<readonly Obstacle[] | null>(null);
  useEffect(() => {
    if (!wanted || obstacles) return;
    let cancelled = false;
    void import("@/access/builtInRules").then(({ builtInObstacles }) => {
      if (!cancelled) setObstacles(builtInObstacles);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, obstacles]);
  return obstacles;
}

export type BuiltInOfficialAires = {
  readonly aires: readonly OfficialAire[];
  readonly stretches: readonly OfficialStretch[];
};

/** The built-in official aires and stretches (ADR 0035), loaded the first time they are wanted. */
export function useBuiltInOfficialAires(wanted: boolean): BuiltInOfficialAires | null {
  const [official, setOfficial] = useState<BuiltInOfficialAires | null>(null);
  useEffect(() => {
    if (!wanted || official) return;
    let cancelled = false;
    void import("@/access/builtInRules").then(({ builtInOfficialAires, builtInOfficialStretches }) => {
      if (!cancelled) setOfficial({ aires: builtInOfficialAires, stretches: builtInOfficialStretches.stretches });
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, official]);
  return official;
}
