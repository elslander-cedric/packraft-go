"use client";

import { useEffect, useRef, useState } from "react";
import type { Router } from "@/core/router";
import { createAutoRouter, retryLeg } from "@/core/routing";
import { defaultSettings, withSetting, type Settings } from "@/core/settings";
import { summarise } from "@/core/summarise";
import {
  applyEdit,
  canUndo,
  emptyTrip,
  isCamp,
  newTripNeedsConfirmation,
  renameTrip,
  type Edit,
  type LatLng,
  type Trip,
} from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import { downloadGpxFile, downloadTripFile, readTripFile } from "@/persistence/tripFile";
import { loadStoredTrip, storeTrip } from "@/persistence/tripStorage";
import { createBRouterRouter } from "@/routing/brouter";
import { ConfirmDialog } from "./components/ConfirmDialog";
import DaysPanel from "./DaysPanel";
import EditToolbar from "./EditToolbar";
import LegsPanel from "./LegsPanel";
import SettingsPanel from "./SettingsPanel";
import { strings } from "./strings";
import TripToolbar from "./TripToolbar";
import { useSettings } from "./useSettings";

/** The questions asked before a trip with points is replaced. */
const confirmations = { newTrip: strings.newTripConfirm, openFile: strings.openFileConfirm } as const;
type Confirmation = keyof typeof confirmations;

/** True when a key press is meant for a text field, not for the planner. */
const typingInField = (event: KeyboardEvent) =>
  event.target instanceof HTMLElement &&
  (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));

/**
 * Holds the current trip and wires the map, toolbar and panel to the trip
 * planner core: they send edits, the core returns the new trip and its figures.
 * The selected point is UI state only; it is cleared by every edit.
 * Legs without a route are routed through `router` whenever the trip changes.
 */
export default function TripPlanner({ router }: { router?: Router }) {
  // Starts from the stored trip, so this component is only rendered in the browser (see ClientTripPlanner).
  const [stored] = useState(loadStoredTrip);
  const [trip, setTrip] = useState(stored.trip);
  // A stored save from a newer or unknown version is kept, not overwritten, until
  // the planner starts a new trip or opens a file (#28).
  const [keepStoredSave, setKeepStoredSave] = useState(stored.unknownVersion);
  // Shown after a file could not be opened, until the planner does something else.
  const [fileError, setFileError] = useState<string | null>(null);
  const [autoRouter] = useState(() => createAutoRouter(router ?? createBRouterRouter(), setTrip));

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

  const retry = (legIndex: number) => {
    setTrip((current) => retryLeg(current, legIndex));
  };
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const edit = (change: Edit) => {
    setTrip((current) => applyEdit(current, change));
    setSelectedPoint(null);
    setFileError(null);
  };
  const rename = (name: string) => {
    setTrip((current) => renameTrip(current, name));
    setFileError(null);
  };
  // A trip waiting to replace the current one until the planner answers the confirmation.
  const [pendingTrip, setPendingTrip] = useState(null as Trip | null);
  // The last question asked; kept after it is answered, so the closing dialog keeps its text and focus target.
  const [question, setQuestion] = useState<Confirmation>("newTrip");
  const newTripButton = useRef(null as HTMLButtonElement | null);
  const openFileButton = useRef(null as HTMLButtonElement | null);
  const applyReplace = (next: Trip) => {
    setTrip(next);
    setSelectedPoint(null);
    setFileError(null);
    setKeepStoredSave(false);
  };
  /** Replaces the current trip, asking first when that would lose points (it cannot be undone). */
  const replaceTrip = (next: Trip, asking: Confirmation) => {
    if (newTripNeedsConfirmation(trip)) {
      setQuestion(asking);
      setPendingTrip(next);
    } else applyReplace(next);
  };
  const confirmReplace = () => {
    if (pendingTrip) applyReplace(pendingTrip);
    setPendingTrip(null);
  };
  const newTrip = () => replaceTrip(emptyTrip(), "newTrip");
  const saveFile = () => {
    setFileError(null);
    downloadTripFile(trip, strings.tripNamePlaceholder);
  };
  const exportGpx = () => {
    setFileError(null);
    downloadGpxFile(trip, {
      untitledTrip: strings.tripNamePlaceholder,
      leg: strings.gpxTrackName,
      camp: strings.gpxCampName,
    });
  };
  const openFile = async (file: File) => {
    const opened = await readTripFile(file);
    if (opened.ok) replaceTrip(opened.trip, "openFile");
    else setFileError(opened.reason === "unknown-version" ? strings.openFileUnknownVersion : strings.openFileInvalid);
  };
  /** Marks or unmarks the selected point as a camp. The point stays selected: no point moves. */
  const toggleSelectedCamp = () => {
    if (selectedPoint === null) return;
    setTrip((current) => applyEdit(current, { type: "toggleCamp", index: selectedPoint }));
    setFileError(null);
  };
  const undo = () => edit({ type: "undo" });
  const deleteSelectedPoint = () => {
    if (selectedPoint !== null) edit({ type: "deletePoint", index: selectedPoint });
  };

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
        setSelectedPoint(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const summary = summarise(trip, settings ?? defaultSettings);
  const confirmation = confirmations[question];

  return (
    <div className="planner">
      <ClientTripMap
        trip={trip}
        selectedPoint={selectedPoint}
        onMapClick={(at: LatLng) => edit({ type: "addPoint", at })}
        onPointClick={(index) => setSelectedPoint((current) => (current === index ? null : index))}
        onPointDrag={(index, to) => edit({ type: "movePoint", index, to })}
      />
      <div className="sidebar">
        {keepStoredSave && (
          <p className="autosave-warning" role="alert">
            {strings.autosaveUnknownVersion}
          </p>
        )}
        <TripToolbar
          name={trip.name}
          fileError={fileError}
          onRename={rename}
          onNewTrip={newTrip}
          onSaveFile={saveFile}
          onExportGpx={trip.legs.length > 0 ? exportGpx : null}
          onOpenFile={(file) => void openFile(file)}
          newTripButtonRef={newTripButton}
          openFileButtonRef={openFileButton}
        />
        <EditToolbar
          canUndo={canUndo(trip)}
          canDeletePoint={selectedPoint !== null}
          selectedPointIsCamp={selectedPoint === null ? null : isCamp(trip, selectedPoint)}
          onUndo={undo}
          onDeletePoint={deleteSelectedPoint}
          onToggleCamp={toggleSelectedCamp}
        />
        <LegsPanel
          summary={summary}
          legs={trip.legs}
          onRetry={retry}
          onSetMode={(index, mode) => edit({ type: "setLegMode", index, mode })}
        />
        <DaysPanel days={summary.days} />
        {settings && <SettingsPanel settings={settings} onChange={changeSetting} />}
      </div>
      <ConfirmDialog
        open={pendingTrip !== null}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={confirmReplace}
        onCancel={() => setPendingTrip(null)}
        returnFocusTo={question === "openFile" ? openFileButton : newTripButton}
      />
    </div>
  );
}
