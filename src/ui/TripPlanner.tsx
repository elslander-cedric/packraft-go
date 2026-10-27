"use client";

import { useRef } from "react";
import type { Router } from "@/core/router";
import { canUndo, isCamp, type LatLng } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
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
import { usePlanner } from "./usePlanner";

/** The questions asked before a trip with points is replaced. */
const confirmations = { newTrip: strings.newTripConfirm, openFile: strings.openFileConfirm } as const;

/**
 * The desktop layout of the planner (map plus sidebar). All state and side
 * effects come from the shared `usePlanner` hook (#115, ADR 0025); this draws
 * them and sends it actions from the map, toolbars, panels and dialog.
 */
export default function TripPlanner({ router }: { router?: Router }) {
  const { session, dispatch, summary, settings, changeSetting, access, waterAccess, aire, saveFile, exportGpx, openFile, undo, deleteSelectedPoint } =
    usePlanner(router);
  const { trip, selectedPoint, offers, fileError, keepStoredSave, question, pendingTrip } = session;
  const newTripButton = useRef<HTMLButtonElement>(null);
  const openFileButton = useRef<HTMLButtonElement>(null);
  const confirmation = confirmations[question];

  return (
    <div className="planner">
      <ClientTripMap
        trip={trip}
        selectedPoint={selectedPoint}
        // While an access point is being placed, the click places it instead of a trip point.
        onMapClick={(at: LatLng) =>
          access.placing ? access.placeAt(at) : dispatch({ type: "addPoint", at, accessPoints: access.points })
        }
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
          onSaveFile={() => saveFile()}
          onExportGpx={trip.legs.length > 0 ? () => exportGpx() : null}
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
