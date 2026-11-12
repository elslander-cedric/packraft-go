"use client";

import { useEffect, useRef, useState } from "react";
import {
  addAccessPoint,
  type AccessPoint,
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
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

/** Why autosave is paused: the stored save is kept as it is. */
export type SavingPaused = "unknown-version" | "damaged";

/** Your access points and what the planner can do with them (ADR 0023). */
export type AccessPointsState = ReturnType<typeof useAccessPoints>;

/**
 * Holds your access points: loaded from browser storage, autosaved on every
 * change, edited through the core. Also the UI state around them: the
 * selected point and the new point being placed (the draft), which is only
 * stored when its details are saved.
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
  // A new point placed on the map and not saved yet: it can be dragged, and the flag opens its details.
  const [draft, setDraft] = useState<AccessPoint | null>(null);

  useEffect(() => {
    if (!keepStoredSave) {
      storeAccessPoints(points);
    }
  }, [points, keepStoredSave]);

  // Default names (ADR 0027): looked up in the background whenever the
  // app is online, for every point still waiting for one, the draft too, so its
  // details show it; never blocks marking.
  const latest = useRef(points);
  const defaultNames = useRef<DefaultNames | null>(null);
  useEffect(() => {
    let cancelled = false;
    const backOnline = () => defaultNames.current?.backOnline();
    void defaultNameSource().then((source) => {
      if (cancelled) {
        return;
      }
      defaultNames.current = startDefaultNames({
        source,
        points: () => latest.current,
        found: (id, at, name) => {
          setPoints((current) => applyDefaultName(current, id, { at, name }));
          setDraft((current) => (current?.id === id ? applyDefaultName([current], id, { at, name })[0]! : current));
        },
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
    latest.current = draft ? [...points, draft] : points;
    defaultNames.current?.wake();
  }, [points, draft]);

  const selected = points.find((point) => point.id === selectedId) ?? null;

  return {
    points,
    selected,
    draft,
    /** Why changes are not being saved, or null while they are. */
    savingPaused,
    /** Where a damaged save was backed up on load, or null. */
    backupKey: stored.backupKey,
    /** Places the draft at `at`, or moves it there (its default name is looked up again); nothing is stored yet. */
    placeDraft: (at: LatLng) => {
      setDraft((current) =>
        current
          ? updateAccessPoint([current], current.id, { position: at }, now())[0]!
          : addAccessPoint([], { id: newId(), at, now: now() })[0]!,
      );
      setSelectedId(null);
    },
    /** Stores the draft with the planner's changes and selects it. */
    saveDraft: (changes: AccessPointChanges) => {
      if (!draft) {
        return;
      }
      const { id } = draft;
      setPoints((current) => updateAccessPoint([...current, draft], id, changes, now()));
      setDraft(null);
      setSelectedId(id);
    },
    discardDraft: () => setDraft(null),
    select: (id: string | null) => setSelectedId(id),
    update: (id: string, changes: AccessPointChanges) =>
      setPoints((current) => updateAccessPoint(current, id, changes, now())),
    remove: (id: string) => {
      setPoints((current) => deleteAccessPoint(current, id));
      setSelectedId((current) => (current === id ? null : current));
    },
  };
}
