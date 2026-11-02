"use client";

import { useMemo, useState } from "react";
import { accessFeatures, type AccessFeature, type LockMarker } from "@/core/access";
import type { Obstacle } from "@/core/obstacle";
import type { OfficialAire, OfficialStretch } from "@/core/officialAire";
import { summarise } from "@/core/summarise";
import type { Trip } from "@/core/trip";
import type { AccessDateProps, AccessTripDay } from "./AccessPanel";
import {
  localToday,
  useAccessRules,
  useBuiltInLocks,
  useBuiltInObstacles,
  useBuiltInOfficialAires,
} from "./useAccessRules";
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
  /** The waters, locks, official aires and obstacles to draw, once the rules have loaded; null while off or loading. */
  shown: {
    features: readonly AccessFeature[];
    locks: readonly LockMarker[];
    aires: readonly OfficialAire[];
    obstacles: readonly Obstacle[];
  } | null;
  /** The water, lock, official aire or obstacle whose details are open, if any. */
  selectedId: string | null;
  select: (id: string | null) => void;
  selectedWater: AccessFeature | undefined;
  selectedLock: LockMarker | undefined;
  selectedAire: OfficialAire | undefined;
  selectedAireStretch: OfficialStretch | undefined;
  selectedObstacle: Obstacle | undefined;
  /** The official aires once loaded, on or off: the Access points tab lists the ones on the route (#208). */
  officialAires: readonly OfficialAire[];
};

const NO_AIRES: readonly OfficialAire[] = [];

/**
 * The access layer's state for the planner: on or off,
 * the date (today unless another is picked, #59), the coloured waters and locks for that
 * date (with live Walloon flows for today, #61), and the water or lock whose details are open.
 * An official aire's details also open with the layer off, from the Access points tab: pass
 * `wantAires` while that tab shows.
 */
export function useAccessLayer(trip: Trip, wantAires: boolean): AccessLayer {
  const [on, setOnState] = useState(false);
  const [selectedId, select] = useState<string | null>(null);
  const rules = useAccessRules(on);
  const locks = useBuiltInLocks(on);
  const official = useBuiltInOfficialAires(on || wantAires);
  const obstacles = useBuiltInObstacles(on);
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
  const selectedAire = official?.aires.find((a) => a.id === selectedId);
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
    shown: on && rules ? { features, locks: locks ?? [], aires: official?.aires ?? [], obstacles: obstacles ?? [] } : null,
    selectedId,
    select,
    selectedWater: on ? features.find((f) => f.record.id === selectedId) : undefined,
    selectedLock: on ? locks?.find((l) => l.id === selectedId) : undefined,
    selectedAire,
    selectedAireStretch: official?.stretches.find((s) => s.id === selectedAire?.officialStretch),
    selectedObstacle: on ? obstacles?.find((o) => o.id === selectedId) : undefined,
    officialAires: official?.aires ?? NO_AIRES,
  };
}
