"use client";

import { useMemo, useState } from "react";
import { accessFeatures, type AccessFeature, type LockMarker } from "@/core/access";
import { summarise } from "@/core/summarise";
import type { Trip } from "@/core/trip";
import type { AccessDateProps, AccessTripDay } from "./AccessPanel";
import { localToday, useAccessRules, useBuiltInLocks } from "./useAccessRules";
import { useWalloonFlows } from "./useWalloonFlows";

export type AccessLayer = {
  /** Whether the layer is switched on. */
  on: boolean;
  setOn: (on: boolean) => void;
  /** The date the layer is for, YYYY-MM-DD, and whether that is today. */
  date: string;
  isToday: boolean;
  /** The date controls' props (#59). */
  dateSelector: AccessDateProps;
  /** The waters and locks to draw, once the rules have loaded; null while off or loading. */
  shown: { features: readonly AccessFeature[]; locks: readonly LockMarker[] } | null;
  /** The water or lock whose details are open, if any. */
  selectedId: string | null;
  select: (id: string | null) => void;
  selectedWater: AccessFeature | undefined;
  selectedLock: LockMarker | undefined;
};

/**
 * The access layer's state for the planner: on or off,
 * the date (today unless another is picked, #59), the coloured waters and locks for that
 * date (with live Walloon flows for today, #61), and the water or lock whose details are open.
 */
export function useAccessLayer(trip: Trip): AccessLayer {
  const [on, setOnState] = useState(false);
  const [selectedId, select] = useState<string | null>(null);
  const rules = useAccessRules(on);
  const locks = useBuiltInLocks(on);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const today = localToday();
  const date = pickedDate ?? today;
  const flows = useWalloonFlows(rules, on && date === today);
  const features = useMemo(
    () =>
      rules
        ? accessFeatures(rules, { date, today, ...(flows && { flows }), flowsPending: on && date === today && !flows })
        : [],
    [rules, date, today, flows, on],
  );
  const tripDays = useMemo<AccessTripDay[]>(
    () =>
      trip.startDate === undefined
        ? []
        : summarise(trip).days.flatMap((d, i) => (d.date === undefined ? [] : [{ day: i + 1, date: d.date }])),
    [trip],
  );
  const setOn = (next: boolean) => {
    setOnState(next);
    if (!next) select(null);
  };
  return {
    on,
    setOn,
    date,
    isToday: pickedDate === null,
    dateSelector: { date, isToday: pickedDate === null, onDate: setPickedDate, onToday: () => setPickedDate(null), tripDays },
    shown: on && rules ? { features, locks: locks ?? [] } : null,
    selectedId,
    select,
    selectedWater: on ? features.find((f) => f.record.id === selectedId) : undefined,
    selectedLock: on ? locks?.find((l) => l.id === selectedId) : undefined,
  };
}
