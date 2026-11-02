"use client";

import { useMemo, useState } from "react";
import {
  accessFeatures,
  officialStretchAccess,
  type AccessContext,
  type AccessFeature,
  type AccessStatus,
  type LockMarker,
} from "@/core/access";
import { incidentsOn, type Incident, type OfficialIncidents } from "@/core/incident";
import { checksFailed, type OfficialCheck } from "@/core/officialStatus";
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
import { useOfficialIncidents, useOfficialStatus } from "./useOfficialStatus";
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
  /** The waters, locks, official aires, obstacles and incidents to draw, once the rules have loaded; null while off or loading. */
  shown: {
    features: readonly AccessFeature[];
    locks: readonly LockMarker[];
    aires: readonly OfficialAire[];
    obstacles: readonly Obstacle[];
    incidents: readonly Incident[];
  } | null;
  /** The water, lock, official aire, obstacle or incident whose details are open, if any. */
  selectedId: string | null;
  select: (id: string | null) => void;
  selectedWater: AccessFeature | undefined;
  selectedLock: LockMarker | undefined;
  selectedAire: OfficialAire | undefined;
  selectedAireStretch: OfficialStretch | undefined;
  /** The access status of the selected aire's stretch on the date; undefined until the rules have loaded. */
  selectedAireStatus: AccessStatus | undefined;
  selectedObstacle: Obstacle | undefined;
  selectedIncident: Incident | undefined;
  /** Today's incidents, once asked for and answered: the details say if they failed (#216). */
  incidents: OfficialIncidents | undefined;
  /** What the SPW couldn't answer for the map, while the layer is on: the map says so (#211, #216). */
  notChecked: readonly OfficialCheck[];
  /** The official aires once loaded, on or off: the Access points tab lists the ones on the route (#208). */
  officialAires: readonly OfficialAire[];
};

const NO_AIRES: readonly OfficialAire[] = [];
const NO_INCIDENTS: readonly Incident[] = [];
const ALL_CHECKED: readonly OfficialCheck[] = [];

/**
 * The access layer's state for the planner: on or off,
 * the date (today unless another is picked, #59), the coloured waters and locks for that
 * date (with live Walloon flows, #61, and the official status, #210, for today), and the water or lock whose details are open.
 * An official aire's details also open with the layer off, from the Access points tab: pass
 * `wantAires` while that tab shows.
 */
export function useAccessLayer(trip: Trip, wantAires: boolean): AccessLayer {
  const [on, setOnState] = useState(false);
  const [selectedId, select] = useState<string | null>(null);
  const builtInAires = useBuiltInOfficialAires(on || wantAires);
  const selectedAire = builtInAires?.aires.find((a) => a.id === selectedId);
  // An aire's details show its stretch's status, also with the layer off (#213).
  const statusShown = on || selectedAire !== undefined;
  const rules = useAccessRules(statusShown);
  const locks = useBuiltInLocks(on);
  const obstacles = useBuiltInObstacles(on);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const today = localToday();
  const date = pickedDate ?? today;
  const shownToday = statusShown && date === today;
  const flows = useWalloonFlows(rules, shownToday);
  // A future date notes today's closures (#212); a past date has no use for them.
  const official = useOfficialStatus(rules, statusShown && date >= today);
  const incidents = useOfficialIncidents(rules, statusShown && date >= today);
  const shownIncidents = useMemo(
    () => (incidents?.status === "ok" ? incidentsOn(incidents.incidents, date) : NO_INCIDENTS),
    [incidents, date],
  );
  const context = useMemo<AccessContext>(
    () => ({
      date,
      today,
      ...(flows && { flows }),
      flowsPending: shownToday && !flows,
      ...(official && { official }),
      officialPending: shownToday && !official,
    }),
    [date, today, flows, official, shownToday],
  );
  const features = useMemo(() => (rules ? accessFeatures(rules, context) : []), [rules, context]);
  const selectedAireStatus = useMemo(
    () => (rules && selectedAire ? officialStretchAccess(selectedAire.officialStretch, rules, context) : undefined),
    [rules, selectedAire, context],
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
    shown:
      on && rules
        ? {
            features,
            locks: locks ?? [],
            aires: builtInAires?.aires ?? [],
            obstacles: obstacles ?? [],
            incidents: shownIncidents,
          }
        : null,
    selectedId,
    select,
    selectedWater: on ? features.find((f) => f.record.id === selectedId) : undefined,
    selectedLock: on ? locks?.find((l) => l.id === selectedId) : undefined,
    selectedAire,
    selectedAireStretch: builtInAires?.stretches.find((s) => s.id === selectedAire?.officialStretch),
    selectedAireStatus,
    selectedObstacle: on ? obstacles?.find((o) => o.id === selectedId) : undefined,
    selectedIncident: on ? shownIncidents.find((i) => i.id === selectedId) : undefined,
    incidents,
    notChecked: on ? checksFailed(official, incidents) : ALL_CHECKED,
    officialAires: builtInAires?.aires ?? NO_AIRES,
  };
}
