"use client";

import { useEffect, useRef, useState } from "react";
import {
  addAccessPoint,
  applyDefaultName,
  deleteAccessPoint,
  updateAccessPoint,
  type AccessPointChanges,
  type AccessPoints,
  type DefaultNameSource,
} from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";
import { loadStoredAccessPoints, storeAccessPoints } from "@/persistence/accessPointStorage";
import { startDefaultNames, type DefaultNames } from "./defaultNames";
import { sharedNominatim } from "./sharedNominatim";

/** The page's one default name source, so its one-request-a-second limit holds for all (ADRs 0027, 0030). */
function defaultNameSource(): Promise<DefaultNameSource> {
  return sharedNominatim().then(({ names }) => names);
}

/** A new, unique id for an access point. */
function newId(): string {
  // randomUUID needs a secure context (https or localhost); fall back elsewhere.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

/** Why autosave is paused: the stored save is kept as it is. */
export type SavingPaused = "unknown-version" | "damaged";

/** Your access points and what the planner can do with them (#55, ADR 0023). */
export type AccessPointsState = ReturnType<typeof useAccessPoints>;

/**
 * Holds your access points: loaded from browser storage, autosaved on every
 * change, edited through the core. Also the UI state around them: the
 * selected point and whether the next map click places a new one.
 * Only rendered in the browser (see ClientTripPlanner).
 */
export function useAccessPoints() {
  const [stored] = useState(loadStoredAccessPoints);
  const [points, setPoints] = useState<AccessPoints>(stored.accessPoints);
  // Saving is paused, so the stored save is kept rather than overwritten, while
  // it is from an unknown version, or damaged and could not be backed up.
  const savingPaused: SavingPaused | null = stored.unknownVersion
    ? "unknown-version"
    : stored.damaged && stored.backupKey === null
      ? "damaged"
      : null;
  const keepStoredSave = savingPaused !== null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!keepStoredSave) storeAccessPoints(points);
  }, [points, keepStoredSave]);

  // Default names (#136, ADR 0027): looked up in the background whenever the
  // app is online, for every point still waiting for one; never blocks marking.
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
        found: (id, at, name) => setPoints((current) => applyDefaultName(current, id, { at, name })),
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
  }, []);
  useEffect(() => {
    latest.current = points;
    defaultNames.current?.wake();
  }, [points]);

  // Escape cancels placing a new point.
  useEffect(() => {
    if (!placing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlacing(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [placing]);

  const selected = points.find((point) => point.id === selectedId) ?? null;

  return {
    points,
    selected,
    placing,
    /** Why changes are not being saved, or null while they are. */
    savingPaused,
    /** Where a damaged save was backed up on load, or null. */
    backupKey: stored.backupKey,
    togglePlacing: () => setPlacing((current) => !current),
    /** Adds a point at `at`, ends placing and selects the new point. Returns its id. */
    placeAt: (at: LatLng): string => {
      const id = newId();
      setPoints((current) => addAccessPoint(current, { id, at, now: now() }));
      setPlacing(false);
      setSelectedId(id);
      return id;
    },
    /** Makes the next map tap place a new point (without toggling it off). */
    startPlacing: () => setPlacing(true),
    select: (id: string | null) => setSelectedId(id),
    update: (id: string, changes: AccessPointChanges) =>
      setPoints((current) => updateAccessPoint(current, id, changes, now())),
    remove: (id: string) => {
      setPoints((current) => deleteAccessPoint(current, id));
      setSelectedId((current) => (current === id ? null : current));
    },
  };
}
