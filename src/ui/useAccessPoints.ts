"use client";

import { useEffect, useState } from "react";
import {
  addAccessPoint,
  deleteAccessPoint,
  mergeAccessPoints,
  updateAccessPoint,
  type AccessPointChanges,
  type AccessPoints,
} from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";
import { downloadAccessPointsFile, readAccessPointsFile } from "@/persistence/accessPointFile";
import { loadStoredAccessPoints, storeAccessPoints } from "@/persistence/accessPointStorage";
import { strings } from "./strings";

/** A new, unique id for an access point. */
function newId(): string {
  // randomUUID needs a secure context (https or localhost); fall back elsewhere.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

/** What the last import said: how it went, or why the file was refused. */
export type ImportMessage = { readonly kind: "done" | "error"; readonly text: string };

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
  // A stored save from an unknown version is kept, not overwritten.
  const keepStoredSave = stored.unknownVersion;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [importMessage, setImportMessage] = useState<ImportMessage | null>(null);

  useEffect(() => {
    if (!keepStoredSave) storeAccessPoints(points);
  }, [points, keepStoredSave]);

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
    importMessage,
    unknownVersion: keepStoredSave,
    togglePlacing: () => {
      setPlacing((current) => !current);
      setImportMessage(null);
    },
    /** Adds a point at `at`, ends placing and selects the new point. */
    placeAt: (at: LatLng) => {
      const id = newId();
      setPoints((current) => addAccessPoint(current, { id, at, now: now() }));
      setPlacing(false);
      setSelectedId(id);
    },
    select: (id: string | null) => {
      setSelectedId(id);
      setImportMessage(null);
    },
    update: (id: string, changes: AccessPointChanges) =>
      setPoints((current) => updateAccessPoint(current, id, changes, now())),
    remove: (id: string) => {
      setPoints((current) => deleteAccessPoint(current, id));
      setSelectedId((current) => (current === id ? null : current));
    },
    exportFile: () => {
      setImportMessage(null);
      downloadAccessPointsFile(points);
    },
    importFile: async (file: File) => {
      const read = await readAccessPointsFile(file);
      if (!read.ok) {
        const text = read.reason === "unknown-version" ? strings.accessPoints.importUnknownVersion : strings.accessPoints.importInvalid;
        setImportMessage({ kind: "error", text });
        return;
      }
      const merged = mergeAccessPoints(points, read.accessPoints, newId);
      setPoints(merged.accessPoints);
      setImportMessage({ kind: "done", text: strings.accessPoints.imported(merged.added, merged.alreadyThere) });
    },
  };
}
