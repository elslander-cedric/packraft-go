"use client";

import { useEffect, useRef, type Dispatch } from "react";
import type { AccessPoint, AccessPoints, DefaultNameSource } from "@/core/accessPoints";
import type { PlannerAction } from "@/core/plannerSession";
import { storeAccessPoints, type LoadedAccessPoints } from "@/persistence/accessPointStorage";
import { startDefaultNames, type DefaultNames } from "./defaultNames";
import { sharedNominatim } from "./sharedNominatim";

/** The page's one default name source, so its one-request-a-second limit holds for all (ADRs 0027, 0030). */
function defaultNameSource(): Promise<DefaultNameSource> {
  return sharedNominatim().then(({ names }) => names);
}

/** Why autosave is paused: the stored save is kept as it is. */
export type SavingPaused = "unknown-version" | "damaged";

/** What the planner shows about storing your access points. */
export type AccessPointsStorage = ReturnType<typeof useAccessPoints>;

/**
 * The side effects of your access points (#55, ADR 0023); the planner session holds them and is
 * their only writer (ADR 0025). Stores them on every change, except while saving is paused, and
 * looks up the default names (ADR 0027) of the stored points and the draft, sending each one found
 * to the session as `defaultNameFound`. `stored` is what loading them returned.
 * Only rendered in the browser (see ClientTripPlanner).
 */
export function useAccessPoints(
  stored: LoadedAccessPoints,
  points: AccessPoints,
  draft: AccessPoint | null,
  dispatch: Dispatch<PlannerAction>,
) {
  // Saving is paused, so the stored save is kept rather than overwritten, while
  // it is from an unknown version, or damaged and could not be backed up.
  const savingPaused: SavingPaused | null = stored.unknownVersion
    ? "unknown-version"
    : stored.damaged && stored.backupKey === null
      ? "damaged"
      : null;
  const keepStoredSave = savingPaused !== null;

  useEffect(() => {
    if (!keepStoredSave) storeAccessPoints(points);
  }, [points, keepStoredSave]);

  // Default names (#136, ADR 0027): looked up in the background whenever the
  // app is online, for every point still waiting for one, the draft too, so its
  // details show it; never blocks marking.
  const latest = useRef(points);
  const defaultNames = useRef<DefaultNames | null>(null);
  useEffect(() => {
    let cancelled = false;
    const backOnline = () => defaultNames.current?.backOnline();
    void defaultNameSource().then((source) => {
      if (cancelled) return;
      defaultNames.current = startDefaultNames({
        source,
        points: () => latest.current,
        found: (id, at, name) => dispatch({ type: "defaultNameFound", id, at, name }),
        online: () => navigator.onLine,
      });
      defaultNames.current.wake();
    });
    window.addEventListener("online", backOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", backOnline);
      defaultNames.current?.stop();
      defaultNames.current = null;
    };
  }, [dispatch]);
  useEffect(() => {
    latest.current = draft ? [...points, draft] : points;
    defaultNames.current?.wake();
  }, [points, draft]);

  return {
    /** Why changes are not being saved, or null while they are. */
    savingPaused,
    /** Where a damaged save was backed up on load, or null. */
    backupKey: stored.backupKey,
  };
}
