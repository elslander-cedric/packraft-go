"use client";

import { useRef, useState, type CSSProperties } from "react";
import { editingAccessPoints as isEditingAccessPoints, normalTabs, type NormalTab } from "@/core/plannerSession";
import type { Router } from "@/core/router";
import { isCamp, type LatLng } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import type { MapFocus } from "@/map/TripMap";
import { Button } from "../components/Button";
import { TabPanel } from "../components/Tabs";
import DaysPanel from "../DaysPanel";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import SnapOffers from "../SnapOffers";
import { strings } from "../strings";
import { MapNotCheckedNote } from "../TripAccessView";
import { useAccessLayer } from "../useAccessLayer";
import { usePlaceSearch } from "../usePlaceSearch";
import { usePlanner } from "../usePlanner";
import { useBaseMap, useOverlays } from "../useSettings";
import AccessChip from "./AccessChip";
import AccessDetailsDialog from "./AccessDetailsDialog";
import AccessPointButtons from "./AccessPointButtons";
import AccessPointDialog from "./AccessPointDialog";
import AccessPoints from "./AccessPoints";
import LegDetailsDialog from "./LegDetailsDialog";
import LegModeCard from "./LegModeCard";
import MapMenu from "./MapMenu";
import PlaceSearch from "./PlaceSearch";
import PlannerMenu from "./PlannerMenu";
import PlannerPanel from "./PlannerPanel";
import PointCard from "./PointCard";
import { positionMessage } from "./position";
import SectionDetailsDialog from "./SectionDetailsDialog";
import SectionsList from "./SectionsList";
import TripButtons from "./TripButtons";
import { useMarkAccessPoint } from "./useMarkAccessPoint";
import { useNextLegMode } from "./useNextLegMode";
import { measureMapCover, usePanel } from "./usePanel";
import { usePosition } from "./usePosition";
import { useTripRows } from "./useTripRows";
import "./planner.css";

/** A tab of normal mode, or the one tab of access point editing. */
type PlannerTab = NormalTab | "accessPoints";
const editingTabs: readonly PlannerTab[] = ["accessPoints"];

/**
 * The planner, on every screen: a full-screen map with floating buttons, and the trip in a bottom
 * sheet (narrow screen in portrait) or a side panel (everywhere else). It draws what `usePlanner`
 * returns and sends it actions; it adds no planning rules.
 *
 * It has two modes. In normal mode a map tap adds a trip point. In access point editing the trip
 * is frozen and a map tap places an access point instead.
 */
export default function Planner({ router }: { router?: Router }) {
  const {
    session,
    dispatch,
    summary,
    settings,
    saveSettings,
    access,
    waterAccess,
    aire,
    officialAires,
    undo,
    deleteSelectedPoint,
    saveFile,
    exportGpx,
    openFile,
  } = usePlanner(router);
  const { trip, selectedPoint, selectedLeg, offers } = session;
  const editingAccessPoints = isEditingAccessPoints(session);
  const snapTargets = { accessPoints: access.points, officialAires };

  const root = useRef<HTMLDivElement>(null);
  const panel = usePanel(editingAccessPoints);
  // Normal mode's tab; kept while editing access points, so leaving brings it back.
  const [tab, setTab] = useState<NormalTab>("sections");

  // Map state that belongs to this device or this visit, never to the trip.
  const [baseMap, chooseBaseMap] = useBaseMap();
  const [overlays, switchOverlay] = useOverlays();
  const layer = useAccessLayer(trip, editingAccessPoints);
  const search = usePlaceSearch();
  const [position, showPosition] = usePosition();
  const positionNote = positionMessage(position);

  // Shows a place on the map, in the part the raised sheet or the open panel leaves free.
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const showOnMap = (place: { at: LatLng } | { area: readonly LatLng[] }) => {
    panel.raise();
    setFocus({ ...place, ...panel.covered() });
  };

  const { nextMode, pickMode, keepOverFirstPoint } = useNextLegMode(trip);
  const rows = useTripRows(trip, summary, (area) => showOnMap({ area }));

  // The access point open in the edit dialog: a stored one, or the new point placed on the map
  // (the draft), which Save stores.
  const [editedId, setEditedId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const editedPoint = editingDraft ? access.draft : (access.points.find((p) => p.id === editedId) ?? null);
  const marking = useMarkAccessPoint(access, position, showPosition, () => setEditingDraft(true));

  const onMapTap = (at: LatLng) => {
    if (editingAccessPoints) access.placeDraft(at);
    else if (selectedPoint !== null || selectedLeg !== null) dispatch({ type: "deselect" });
    else {
      keepOverFirstPoint();
      dispatch({ type: "addPoint", at, mode: nextMode, ...snapTargets });
    }
  };

  // Entering shows the Access points tab, opening the panel if it was closed; leaving restores
  // the tab and the sheet or panel as they were. Both clear the selection.
  const enterAccessPointEditing = () => {
    dispatch({ type: "enterAccessPointEditing", returnTo: { tab, sheet: panel.stop } });
    access.select(null);
    panel.openForEditing();
  };
  const leaveAccessPointEditing = () => {
    if (session.mode.kind === "normal") return;
    const { returnTo } = session.mode;
    dispatch({ type: "leaveAccessPointEditing" });
    access.select(null);
    access.discardDraft();
    marking.clearNeedsTap();
    setTab(returnTo.tab);
    panel.setStop(returnTo.sheet);
  };

  // A marker tap selects the access point; while editing it also brings its row into view.
  const selectAccessPoint = (id: string) => {
    access.select(id);
    if (editingAccessPoints) panel.raiseFromPeek();
  };
  // A row tap selects it and shows it on the map.
  const showAccessPoint = (id: string) => {
    const point = access.points.find((p) => p.id === id);
    if (!point) return;
    access.select(id);
    showOnMap({ at: point.position });
  };

  const layoutClass = panel.sideways
    ? `planner-sideways ${panel.open ? "planner-panel-open" : "planner-panel-collapsed"}`
    : `planner-stop-${panel.stop}`;
  const layoutVariables = {
    "--side-panel-width": `${panel.shownWidth}px`,
    ...(panel.peekPx === null ? {} : { "--sheet-peek": `${panel.peekPx}px` }),
  } as CSSProperties;

  return (
    <div ref={root} className={`planner ${layoutClass}`} style={layoutVariables}>
      <ClientTripMap
        baseMap={baseMap}
        overlays={overlays}
        trip={trip}
        onMapTap={onMapTap}
        selectedPoint={selectedPoint}
        onPointTap={(index) => dispatch({ type: "pointClicked", index })}
        onPointDrop={(index, to) => dispatch({ type: "movePoint", index, to, ...snapTargets })}
        onLegHold={(index, near) => dispatch({ type: "insertPoint", index, near })}
        selectedLeg={selectedLeg}
        onLegTap={(index) => dispatch({ type: "legClicked", index })}
        frozen={editingAccessPoints}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
        accessPoints={{
          points: access.points,
          editable: editingAccessPoints,
          selectedId: access.selected?.id ?? null,
          onSelect: selectAccessPoint,
          onMove: (id, to) => access.update(id, { position: to }),
          draft: editingAccessPoints ? access.draft : null,
          onDraftMove: (to) => access.placeDraft(to),
        }}
        focus={focus}
        access={layer.shown && { ...layer.shown, selectedId: layer.selectedId, onSelect: layer.select }}
        searchResult={search.state.shown}
        searchCover={() => measureMapCover(root.current, panel)}
        onAreaChange={search.setArea}
      />

      {layer.on && (
        <div className="planner-access-chip-slot">
          <AccessChip dateSelector={layer.dateSelector} />
          <MapNotCheckedNote checks={layer.notChecked} />
        </div>
      )}

      <div className="planner-buttons planner-buttons-top planner-buttons-left">
        <PlannerMenu
          trip={trip}
          question={session.question}
          pendingTrip={session.pendingTrip}
          fileError={session.fileError}
          dispatch={dispatch}
          saveFile={saveFile}
          exportGpx={exportGpx}
          openFile={openFile}
          settings={settings}
          saveSettings={saveSettings}
        />
        {session.keepStoredSave && (
          <p role="alert" className="planner-message planner-message-alert">
            {strings.autosaveUnknownVersion}
          </p>
        )}
      </div>

      <PlaceSearch search={search} />

      <div className="planner-buttons planner-buttons-top">
        <Button
          className="planner-fab"
          aria-label={strings.planner.showPositionButton}
          onClick={() => showPosition()}
          disabled={position.state === "locating"}
        >
          <Icon icon={icons.showPosition} />
        </Button>
        <MapMenu
          baseMap={baseMap}
          onBaseMapChange={chooseBaseMap}
          accessLayerOn={layer.on}
          onAccessLayerChange={layer.setOn}
          overlays={overlays}
          onOverlayChange={switchOverlay}
        />
        {positionNote && (
          <p role={positionNote.kind} className={`planner-message planner-message-${positionNote.kind}`}>
            {positionNote.text}
          </p>
        )}
      </div>

      <div className="planner-buttons planner-buttons-bottom planner-buttons-left">
        <AccessPointButtons
          editing={editingAccessPoints}
          marking={marking}
          onEnter={enterAccessPointEditing}
          onLeave={leaveAccessPointEditing}
        />
      </div>

      {/* Everything below edits or selects in the trip, so none of it shows while the trip is frozen. */}
      <div className="planner-buttons planner-buttons-bottom">
        {!editingAccessPoints && (
          <TripButtons
            trip={trip}
            nextMode={nextMode}
            onNextModeChange={pickMode}
            onUndo={undo}
            onBackToStart={() => dispatch({ type: "backToStart", mode: nextMode })}
          />
        )}
      </div>

      <AccessDetailsDialog
        water={layer.selectedWater}
        lock={layer.selectedLock}
        aire={layer.selectedAire}
        aireStretch={layer.selectedAireStretch}
        aireStatus={layer.selectedAireStatus}
        obstacle={layer.selectedObstacle}
        {...(layer.selectedIncident && { incident: layer.selectedIncident })}
        date={layer.date}
        {...(layer.incidents && { incidents: layer.incidents })}
        onClose={() => layer.select(null)}
      />
      <LegDetailsDialog
        leg={rows.detailsLeg}
        summary={summary}
        access={waterAccess}
        aire={aire}
        onClose={() => rows.setDetailsLeg(null)}
      />
      <SectionDetailsDialog
        section={rows.detailsSection}
        summary={summary}
        access={waterAccess}
        aire={aire}
        onClose={() => rows.setDetailsSection(null)}
      />

      {/* The selection's card and the snap offers share one slot above the sheet or panel. */}
      <div className="planner-snap-offers">
        {!editingAccessPoints && selectedPoint !== null && (
          <PointCard
            point={selectedPoint}
            distanceKm={summary.legs.slice(0, selectedPoint).reduce((km, leg) => km + leg.distanceKm, 0)}
            camp={isCamp(trip, selectedPoint)}
            onDelete={deleteSelectedPoint}
            onCamp={() => dispatch({ type: "toggleCampOnSelectedPoint" })}
            onClose={() => dispatch({ type: "deselect" })}
          />
        )}
        {selectedLeg !== null && summary.legs[selectedLeg] && (
          <LegModeCard
            leg={selectedLeg}
            mode={trip.legs[selectedLeg].mode}
            distanceKm={summary.legs[selectedLeg].distanceKm}
            onChange={(mode) => dispatch({ type: "setLegMode", index: selectedLeg, mode, ...snapTargets })}
            onClose={() => dispatch({ type: "deselect" })}
          />
        )}
        <SnapOffers
          // Offers made before entering access point editing wait until leaving.
          offers={editingAccessPoints ? [] : offers}
          onAccept={(offer) => dispatch({ type: "acceptOffer", offer })}
          onDecline={(offer) => dispatch({ type: "declineOffer", offer })}
        />
      </div>

      <PlannerPanel<PlannerTab>
        panel={panel}
        totals={summary.trip}
        tabs={editingAccessPoints ? editingTabs : normalTabs}
        tab={editingAccessPoints ? "accessPoints" : tab}
        onTabChange={(next) => next !== "accessPoints" && setTab(next)}
      >
        {editingAccessPoints ? (
          <TabPanel value="accessPoints">
            <AccessPoints
              access={access}
              trip={trip}
              officialAires={layer.officialAires}
              position={position.state === "shown" ? position.at : null}
              onOpen={showAccessPoint}
              onOpenAire={layer.select}
              onEdit={(id) => {
                access.select(id);
                setEditedId(id);
              }}
            />
          </TabPanel>
        ) : (
          <>
            <TabPanel value="sections">
              <SectionsList
                summary={summary}
                legs={trip.legs}
                access={waterAccess}
                aire={aire}
                selected={rows.selectedSection}
                selectedLeg={rows.selectedLeg}
                open={rows.openSections}
                onSelect={rows.selectSection}
                onSelectLeg={rows.selectLeg}
                onShowDetails={rows.setDetailsSection}
                onShowLegDetails={rows.setDetailsLeg}
                onRetry={(index) => dispatch({ type: "retryLeg", index })}
              />
            </TabPanel>
            <TabPanel value="days">
              {summary.days.length === 0 && <p className="planner-empty">{strings.daysPanelEmpty}</p>}
              <DaysPanel
                days={summary.days}
                access={waterAccess?.days}
                aire={aire}
                onSelectDay={rows.selectDay}
                selectedDay={rows.selectedDay}
                // A day card's warning chip opens its leg's details.
                onShowLeg={rows.setDetailsLeg}
              />
            </TabPanel>
          </>
        )}
      </PlannerPanel>

      <AccessPointDialog
        point={editedPoint}
        unsaved={editingDraft}
        onSave={(id, changes) => {
          if (!editingDraft) return access.update(id, changes);
          // The new point is now stored and selected: bring its row into view.
          access.saveDraft(changes);
          panel.raiseFromPeek();
        }}
        onClose={() => {
          setEditedId(null);
          setEditingDraft(false);
        }}
      />
    </div>
  );
}
