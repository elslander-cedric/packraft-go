"use client";

import { useEffect, useState } from "react";
import type { AccessRules } from "@/core/access";
import type { CalendarDate } from "@/core/calendarDate";

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
