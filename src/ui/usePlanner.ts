"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { aireWarnings } from "@/core/aire";
import type { Router } from "@/core/router";
import { editingAccessPoints, firstSession, plannerSession } from "@/core/plannerSession";
import { createAutoRouter } from "@/core/routing";
import { defaultSettings, withSetting, type PaceSetting } from "@/core/settings";
import { summarise } from "@/core/summarise";
import { renameTrip } from "@/core/trip";
import { tripAccess } from "@/core/tripAccess";
import { downloadGpxZip, downloadTripFile, readTripFile } from "@/persistence/tripFile";
import { loadStoredTrip, storeTrip } from "@/persistence/tripStorage";
import { createBRouterRouter } from "@/routing/brouter";
import { strings } from "./strings";
import { useAccessPoints } from "./useAccessPoints";
import { localToday, useAccessRules, useBuiltInLocks, useBuiltInObstacles, useBuiltInOfficialAires } from "./useAccessRules";
import { useSettings } from "./useSettings";
import { useOfficialIncidents, useOfficialStatus } from "./useOfficialStatus";
import { useWalloonFlows } from "./useWalloonFlows";

/** True when a key press is meant for a text field, not for the planner. */
const typingInField = (event: KeyboardEvent) =>
  event.target instanceof HTMLElement &&
  (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));

/**
 * The planner, shared by every layout (#115, ADR 0026). Runs the planner
 * session (ADR 0025: one pure function `(session, action) -> session` in the
 * core, run here with a reducer) and keeps all its side effects: autosave
 * (skipped while the stored save is kept), route requests through `router`
 * whenever the trip changes, settings, access points, access rules, locks, live
 * Walloon flows, aire warnings, reading and downloading files, and the key
 * bindings. It adds no planning rules; layouts only draw its result and send
 * it actions. Starts from the stored trip, so it only runs in the browser.
 */
export function usePlanner(router?: Router) {
  const [session, dispatch] = useReducer(plannerSession, undefined, () => firstSession(loadStoredTrip()));
  const { trip, selectedPoint, keepStoredSave, pendingTrip } = session;
  const frozen = editingAccessPoints(session);
  const [autoRouter] = useState(() => createAutoRouter(router ?? createBRouterRouter(), dispatch));

  // Every change is saved. Restored legs keep their routed results, so syncing routes nothing new.
  useEffect(() => {
    if (!keepStoredSave) storeTrip(trip);
    void autoRouter.sync(trip);
  }, [autoRouter, trip, keepStoredSave]);

  // Settings live in browser storage (null only without one, e.g. on a server);
  // until they are read, figures use the defaults.
  const [settings, setSettings] = useSettings();
  // An empty field (null), like any unusable value, changes nothing.
  const changeSetting = (name: PaceSetting, value: number | null) => {
    if (settings === null || value === null) return;
    const changed = withSetting(settings, name, value);
    if (changed !== settings) setSettings(changed);
  };

  // Your access points (#55): their own collection, apart from the trip.
  const access = useAccessPoints();
  // Snap offers follow your access points (#97): tell the session whenever they change.
  useEffect(() => {
    dispatch({ type: "accessPointsChanged", accessPoints: access.points });
  }, [access.points]);

  // With a `name` (the planner asks for it first, #124), the trip is renamed, then saved or exported
  // under that name.
  const toDownload = (name?: string) => {
    if (name === undefined) return trip;
    dispatch({ type: "rename", name });
    return renameTrip(trip, name);
  };
  const saveFile = (name?: string) => {
    const saved = toDownload(name);
    dispatch({ type: "fileDownloaded" });
    downloadTripFile(saved, strings.tripNamePlaceholder);
  };
  const exportGpx = (name?: string) => {
    const exported = toDownload(name);
    dispatch({ type: "fileDownloaded" });
    downloadGpxZip(exported, { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName });
  };
  const openFile = async (file: File) => {
    const opened = await readTripFile(file);
    if (opened.ok) dispatch({ type: "fileOpened", trip: opened.trip });
    else dispatch({ type: "fileRejected", reason: opened.reason === "unknown-version" ? "unknown-version" : "invalid" });
  };
  const undo = () => dispatch({ type: "undo" });
  const deleteSelectedPoint = () => dispatch({ type: "deleteSelectedPoint" });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While a confirmation is open, keys belong to it (Escape cancels it).
      if (pendingTrip || typingInField(event)) return;
      // While editing access points the trip is frozen (#227): undo and delete are off.
      if (frozen) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedPoint !== null) {
        event.preventDefault();
        deleteSelectedPoint();
      } else if (event.key === "Escape") {
        dispatch({ type: "deselect" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const summary = summarise(trip, settings ?? defaultSettings);
  // Access status and warnings on paddle legs (#58): the rules load once the trip has a paddle leg.
  const hasPaddle = trip.legs.some((leg) => leg.mode === "paddle");
  const rules = useAccessRules(hasPaddle);
  const locks = useBuiltInLocks(hasPaddle) ?? undefined; // Lock warnings (#60).
  const obstacles = useBuiltInObstacles(hasPaddle) ?? undefined; // Obstacle warnings (#215).
  const today = localToday();
  const rulesAccess = useMemo(() => (rules ? tripAccess(trip, rules, { today, locks, obstacles }) : null), [trip, rules, today, locks, obstacles]);
  // Paddle legs dated today use the live Walloon flows (#61) and the official status (#210), asked for only when there are some.
  const legToday = rulesAccess?.legs.some((leg) => leg?.date === today) ?? false;
  const flows = useWalloonFlows(rules, legToday);
  // A leg on a later date notes today's closures (#212).
  const legUpcoming = rulesAccess?.legs.some((leg) => leg?.date !== undefined && leg.date >= today) ?? false;
  const official = useOfficialStatus(rules, legUpcoming);
  // Incident warnings (#217) on every paddle leg, dated or not, and the note when they fail (#216).
  const incidents = useOfficialIncidents(rules, hasPaddle);
  const flowsPending = flows === undefined && legToday;
  const officialPending = official === undefined && legToday;
  const waterAccess = useMemo(
    () =>
      rules && hasPaddle
        ? tripAccess(trip, rules, {
            today,
            ...(flows && { flows }),
            flowsPending,
            ...(official && { official }),
            officialPending,
            ...(incidents && { incidents }),
            locks,
            obstacles,
          })
        : rulesAccess,
    [trip, rules, today, flows, flowsPending, official, officialPending, incidents, locks, obstacles, rulesAccess, hasPaddle],
  );
  // Wanted from the first point, not the first paddle leg: that leg's own put-in may be offered one.
  const officialAires = useBuiltInOfficialAires(trip.points.length > 0)?.aires;
  // No warnings until the aires are in: a put-in at one must not warn for a moment.
  const aire = useMemo(
    () => (rules && officialAires ? aireWarnings(trip, rules, access.points, officialAires) : []),
    [trip, rules, access.points, officialAires],
  );

  return {
    session,
    dispatch,
    summary,
    settings,
    changeSetting,
    saveSettings: setSettings,
    access,
    waterAccess,
    aire,
    officialAires: officialAires ?? [],
    saveFile,
    exportGpx,
    openFile,
    undo,
    deleteSelectedPoint,
  };
}
