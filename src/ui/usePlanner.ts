"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { aireWarnings } from "@/core/aire";
import type { Router } from "@/core/router";
import { firstSession, plannerSession } from "@/core/plannerSession";
import { createAutoRouter } from "@/core/routing";
import { defaultSettings, withSetting, type Settings } from "@/core/settings";
import { summarise } from "@/core/summarise";
import { renameTrip } from "@/core/trip";
import { tripAccess } from "@/core/tripAccess";
import { downloadGpxZip, downloadTripFile, readTripFile } from "@/persistence/tripFile";
import { loadStoredTrip, storeTrip } from "@/persistence/tripStorage";
import { createBRouterRouter } from "@/routing/brouter";
import { strings } from "./strings";
import { useAccessPoints } from "./useAccessPoints";
import { localToday, useAccessRules, useBuiltInLocks } from "./useAccessRules";
import { useSettings } from "./useSettings";
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
  const [autoRouter] = useState(() => createAutoRouter(router ?? createBRouterRouter(), dispatch));

  // Every change is saved. Restored legs keep their routed results, so syncing routes nothing new.
  useEffect(() => {
    if (!keepStoredSave) storeTrip(trip);
    void autoRouter.sync(trip);
  }, [autoRouter, trip, keepStoredSave]);

  // Settings live in browser storage (null only without one, e.g. on a server);
  // until they are read, figures use the defaults.
  const [settings, setSettings] = useSettings();
  const changeSetting = (name: keyof Settings, value: number) => {
    if (settings === null) return;
    const changed = withSetting(settings, name, value);
    if (changed !== settings) setSettings(changed);
  };

  // Your access points (#55): their own collection, apart from the trip.
  const access = useAccessPoints();
  // Snap offers follow your access points (#97): tell the session whenever they change.
  useEffect(() => {
    dispatch({ type: "accessPointsChanged", accessPoints: access.points });
  }, [access.points]);

  const saveFile = () => {
    dispatch({ type: "fileDownloaded" });
    downloadTripFile(trip, strings.tripNamePlaceholder);
  };
  const exportGpx = () => {
    dispatch({ type: "fileDownloaded" });
    downloadGpxZip(trip, { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName });
  };
  // The phone asks for the name first (#124): rename the trip, then save or export it under that name.
  const named = (name: string) => {
    dispatch({ type: "rename", name });
    return renameTrip(trip, name);
  };
  const saveFileAs = (name: string) => {
    const renamed = named(name);
    dispatch({ type: "fileDownloaded" });
    downloadTripFile(renamed, strings.tripNamePlaceholder);
  };
  const exportGpxAs = (name: string) => {
    const renamed = named(name);
    dispatch({ type: "fileDownloaded" });
    downloadGpxZip(renamed, { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName });
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
  const today = localToday();
  const rulesAccess = useMemo(() => (rules ? tripAccess(trip, rules, { today, locks }) : null), [trip, rules, today, locks]);
  // Paddle legs dated today use the live Walloon flows (#61), asked for only when there are some.
  const flows = useWalloonFlows(rules, rulesAccess?.legs.some((leg) => leg?.date === today) ?? false);
  const flowsPending = flows === undefined && (rulesAccess?.legs.some((leg) => leg?.date === today) ?? false);
  const waterAccess = useMemo(
    () =>
      rules && (flows || flowsPending)
        ? tripAccess(trip, rules, { today, ...(flows && { flows }), flowsPending, locks })
        : rulesAccess,
    [trip, rules, today, flows, flowsPending, locks, rulesAccess],
  );
  const aire = useMemo(() => (rules ? aireWarnings(trip, rules, access.points) : []), [trip, rules, access.points]);

  return {
    session,
    dispatch,
    summary,
    settings,
    changeSetting,
    access,
    waterAccess,
    aire,
    saveFile,
    exportGpx,
    saveFileAs,
    exportGpxAs,
    openFile,
    undo,
    deleteSelectedPoint,
  };
}
