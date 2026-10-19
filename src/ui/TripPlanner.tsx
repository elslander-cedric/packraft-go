"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { aireWarnings } from "@/core/aire";
import type { Router } from "@/core/router";
import { firstSession, plannerSession } from "@/core/plannerSession";
import { createAutoRouter } from "@/core/routing";
import { defaultSettings, withSetting, type Settings } from "@/core/settings";
import { summarise } from "@/core/summarise";
import { tripAccess } from "@/core/tripAccess";
import { canUndo, isCamp, type LatLng } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import { downloadGpxZip, downloadTripFile, readTripFile } from "@/persistence/tripFile";
import { loadStoredTrip, storeTrip } from "@/persistence/tripStorage";
import { createBRouterRouter } from "@/routing/brouter";
import AccessPointsPanel from "./AccessPointsPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import DaysPanel from "./DaysPanel";
import EditToolbar from "./EditToolbar";
import LegsPanel from "./LegsPanel";
import SettingsPanel from "./SettingsPanel";
import SnapOffers from "./SnapOffers";
import { strings } from "./strings";
import { TripAccessSummary } from "./TripAccessView";
import TripToolbar from "./TripToolbar";
import { useAccessPoints } from "./useAccessPoints";
import { localToday, useAccessRules, useBuiltInLocks } from "./useAccessRules";
import { useWalloonFlows } from "./useWalloonFlows";
import { useSettings } from "./useSettings";

/** The questions asked before a trip with points is replaced. */
const confirmations = { newTrip: strings.newTripConfirm, openFile: strings.openFileConfirm } as const;

/** True when a key press is meant for a text field, not for the planner. */
const typingInField = (event: KeyboardEvent) =>
  event.target instanceof HTMLElement &&
  (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));

/**
 * Runs the planner on the planner session (ADR 0025): one pure function
 * `(session, action) -> session` in the core, run here with a reducer. It holds
 * the trip, the selected point, the snap offers, the file error, whether the
 * stored save is kept and the replace question, and it is the only writer of the
 * trip. This component sends it actions from the map, toolbars, panels, dialog
 * and keys, and keeps the side effects: autosave (skipped while the stored save
 * is kept), route requests, reading and downloading files, and the key bindings
 * with the "typing in a field" check.
 * Legs without a route are routed through `router` whenever the trip changes.
 */
export default function TripPlanner({ router }: { router?: Router }) {
  // Starts from the stored trip, so this component is only rendered in the browser (see ClientTripPlanner).
  const [session, dispatch] = useReducer(plannerSession, undefined, () => firstSession(loadStoredTrip()));
  const { trip, selectedPoint, offers, fileError, keepStoredSave, question, pendingTrip } = session;
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

  const newTripButton = useRef<HTMLButtonElement>(null);
  const openFileButton = useRef<HTMLButtonElement>(null);
  const saveFile = () => {
    dispatch({ type: "fileDownloaded" });
    downloadTripFile(trip, strings.tripNamePlaceholder);
  };
  const exportGpx = () => {
    dispatch({ type: "fileDownloaded" });
    downloadGpxZip(trip, { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName });
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
  const confirmation = confirmations[question];

  return (
    <div className="planner">
      <ClientTripMap
        trip={trip}
        selectedPoint={selectedPoint}
        // While an access point is being placed, the click places it instead of a trip point.
        onMapClick={(at: LatLng) => (access.placing ? access.placeAt(at) : dispatch({ type: "addPoint", at }))}
        onPointClick={(index) => dispatch({ type: "pointClicked", index })}
        onPointDrag={(index, to) => dispatch({ type: "movePoint", index, to })}
        accessPoints={{
          points: access.points,
          selectedId: access.selected?.id ?? null,
          onSelect: access.select,
          onMove: (id, position) => access.update(id, { position }),
        }}
      />
      <div className="sidebar">
        {keepStoredSave && (
          <p className="autosave-warning" role="alert">
            {strings.autosaveUnknownVersion}
          </p>
        )}
        <TripToolbar
          name={trip.name}
          fileError={fileError === null ? null : fileError === "unknown-version" ? strings.openFileUnknownVersion : strings.openFileInvalid}
          onRename={(name) => dispatch({ type: "rename", name })}
          startDate={trip.startDate}
          onSetStartDate={(date) => dispatch({ type: "setStartDate", date })}
          onNewTrip={() => dispatch({ type: "newTrip" })}
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
          onToggleCamp={() => dispatch({ type: "toggleCampOnSelectedPoint" })}
        />
        <SnapOffers offers={offers} onAccept={(offer) => dispatch({ type: "acceptOffer", offer })} onDecline={(offer) => dispatch({ type: "declineOffer", offer })} />
        <LegsPanel
          summary={summary}
          legs={trip.legs}
          access={waterAccess}
          aire={aire}
          onRetry={(index) => dispatch({ type: "retryLeg", index })}
          onSetMode={(index, mode) => dispatch({ type: "setLegMode", index, mode, accessPoints: access.points })}
        />
        <DaysPanel days={summary.days} access={waterAccess?.days} aire={aire} />
        {waterAccess && <TripAccessSummary access={waterAccess.trip} aire={aire} />}
        <AccessPointsPanel access={access} />
        {settings && <SettingsPanel settings={settings} onChange={changeSetting} />}
      </div>
      <ConfirmDialog
        open={pendingTrip !== null}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={() => dispatch({ type: "confirmReplace" })}
        onCancel={() => dispatch({ type: "cancelReplace" })}
        returnFocusTo={question === "openFile" ? openFileButton : newTripButton}
      />
    </div>
  );
}
