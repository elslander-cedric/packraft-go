"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import {
  editingAccessPoints as isEditingAccessPoints,
  mapEditing,
  nextLegMode,
  normalTabs,
  shownOffers,
  shownTab,
  type PanelRow,
  type PlannerTab,
  type SheetStop,
} from "@/core/plannerSession";
import type { Router } from "@/core/router";
import { canGoBackToStart, canUndo, isCamp, type LatLng, type Trip } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import type { MapFocus } from "@/map/TripMap";
import type { MapCover } from "@/map/SearchResultLayer";
import { BottomSheet, sheetStopShare } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { SidePanel, useSidePanelWidth } from "../components/SidePanel";
import { sidePanelCover } from "../components/sidePanelWidth";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { ToggleGroup } from "../components/ToggleGroup";
import DaysPanel from "../DaysPanel";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import { useAccessLayer } from "../useAccessLayer";
import { useBaseMap, useOverlays, useSidePanel } from "../useSettings";
import { usePlaceSearch } from "../usePlaceSearch";
import { stamp, usePlanner } from "../usePlanner";
import AccessChip from "./AccessChip";
import AccessDetailsDialog from "./AccessDetailsDialog";
import AccessPointDialog from "./AccessPointDialog";
import AccessPoints from "./AccessPoints";
import SnapOffers from "../SnapOffers";
import { MapNotCheckedNote } from "../TripAccessView";
import LegDetailsDialog from "./LegDetailsDialog";
import LegModeCard, { legModeOptions } from "./LegModeCard";
import SectionDetailsDialog from "./SectionDetailsDialog";
import SectionsList from "./SectionsList";
import MapMenu from "./MapMenu";
import PlannerMenu from "./PlannerMenu";
import PlaceSearch from "./PlaceSearch";
import PointCard from "./PointCard";
import TripTotals from "./TripTotals";
import { positionMessage } from "./position";
import { useMarkAccessPoint } from "./useMarkAccessPoint";
import { useSideways } from "./usePlannerLayout";
import { usePosition } from "./usePosition";
import "./planner.css";

const editingTabs: readonly PlannerTab[] = ["accessPoints"];

/** Where a day or a section goes: its points and its legs' routes. */
function legsArea(trip: Trip, { firstLeg, lastLeg }: { firstLeg: number; lastLeg: number }): LatLng[] {
  const area: LatLng[] = trip.points.slice(firstLeg, lastLeg + 2);
  for (const leg of trip.legs.slice(firstLeg, lastLeg + 1))
    if (leg.route?.status === "routed") area.push(...leg.route.geometry);
  return area;
}

/**
 * The planner, on every screen (ADRs 0026, 0034): a full-screen map with a bottom
 * sheet over it on a narrow screen in portrait, a side panel on its right everywhere
 * else (#126). It draws what `usePlanner` returns and sends it actions; it adds no
 * planning rules.
 */
export default function Planner({ router }: { router?: Router }) {
  const {
    session,
    dispatch,
    summary,
    settings,
    saveSettings,
    accessStorage,
    waterAccess,
    aire,
    undo,
    deleteSelectedPoint,
    saveFile,
    exportGpx,
    openFile,
  } = usePlanner(router);
  const { trip, selectedPoint, draft } = session;
  const undoReasonId = useId();
  const backToStartReasonId = useId();
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  // Access point editing (ADR 0036): the planner's other mode, kept in the planner session.
  const editingAccessPoints = isEditingAccessPoints(session);
  // What the map lets you change, from the mode: the trip, or your access points and the draft (#227, #242).
  const mapEdits = mapEditing(session);
  // The panel view (#243) is in the planner session: the tab, the sheet's stop (kept while sideways,
  // so turning back to portrait restores it; #126) and the panel's open state while editing.
  const { panel, highlightedRow } = session;
  const stop = panel.sheetStop;
  const setStop = (to: SheetStop) => dispatch({ type: "sheetMoved", stop: to });
  // The peek's height, so the bottom buttons sit just above it.
  const [peekPx, setPeekPx] = useState<number | null>(null);
  // Except on a narrow screen in portrait, the side panel replaces the sheet (ADR 0034). Its width
  // and whether it is open are settings on this device, kept as they were whatever the sheet's stop.
  const sideways = useSideways();
  const [{ width: panelWidth, open: storedPanelOpen }, changePanel] = useSidePanel();
  // While editing access points the panel's open state is in the session, not stored: a reload made
  // while editing comes back in normal mode with the panel as it was before entering (ADR 0036).
  const panelOpen = editingAccessPoints ? panel.openWhileEditing : storedPanelOpen;
  const setPanelOpen = (open: boolean) =>
    editingAccessPoints ? dispatch({ type: "panelToggled", open }) : changePanel({ open });
  const shownPanelWidth = useSidePanelWidth(panelWidth);
  // Shows the content: the sheet raised to half, or the panel opened.
  const raise = () => (sideways ? setPanelOpen(true) : setStop("half"));
  // The same, but a sheet above the peek stays where it is.
  const raiseFromPeek = () => {
    if (sideways) setPanelOpen(true);
    else if (stop === "peek") setStop("half");
  };
  // How much of the map the raised sheet or the open panel covers, for a map focus.
  const covered = () =>
    sideways ? { coveredBelow: 0, coveredRight: sidePanelCover(panelWidth, window.innerWidth) } : { coveredBelow: 0.5 };
  // The access point open in the edit dialog, if any: a stored one by id, or the new point placed
  // on the map (the draft), which Save stores.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const editing = editingDraft
    ? draft
    : editingId === null
      ? null
      : (session.accessPoints.find((p) => p.id === editingId) ?? null);
  const marking = useMarkAccessPoint(
    { editing: editingAccessPoints, hasDraft: draft !== null },
    position,
    showPosition,
    (at) => dispatch({ type: "draftPlaced", at, ...stamp() }),
    () => setEditingDraft(true),
  );
  // The access layer (#125): on or off, its date, and the water or lock whose details are open.
  const layer = useAccessLayer(trip, editingAccessPoints);
  // The base map (ADR 0031): a setting on this device, never in the trip.
  const [baseMap, chooseBaseMap] = useBaseMap();
  // The overlays (ADR 0032): settings on this device too.
  const [overlays, switchOverlay] = useOverlays();
  // Where the map last zoomed to, for an access point row (#119).
  const [focus, setFocus] = useState<MapFocus | null>(null);

  // The next leg's mode (#121), kept in the planner session.
  const nextMode = nextLegMode(session);
  // The leg whose access details dialog is open (#158), if any.
  const [detailsLeg, setDetailsLeg] = useState<number | null>(null);
  // Place search (#174) belongs to the map, not the trip: it lives here, outside the planner session.
  const search = usePlaceSearch();
  // What hides the map where a search result is shown: the pill and the access chip under it,
  // and the sheet or the side panel, measured when a result is shown.
  const root = useRef<HTMLDivElement>(null);
  const searchCover = (): MapCover => {
    const top = root.current?.getBoundingClientRect().top ?? 0;
    const rows = root.current?.querySelectorAll(".planner-place-search, .planner-access-chip-slot") ?? [];
    const rowsBottom = Math.max(top, ...Array.from(rows, (row) => row.getBoundingClientRect().bottom));
    const panel = root.current?.querySelector(".side-panel")?.getBoundingClientRect().width ?? 0;
    const sheet = stop === "peek" ? (peekPx ?? 0) : sheetStopShare[stop] * window.innerHeight;
    return { top: rowsBottom - top, right: sideways ? panel : 0, bottom: sideways ? 0 : sheet };
  };

  // The session decides what a tap does (#120, #230, #227): place the new access point, clear the
  // selection or add a point.
  const onMapTap = (at: LatLng) => dispatch({ type: "mapTapped", at, ...stamp() });
  // The highlighted row (#243), in the session: edits clear it, so it never marks another row.
  const highlighted = (kind: PanelRow["kind"]) => (highlightedRow?.kind === kind ? highlightedRow.index : undefined);
  const highlightedLeg = highlighted("leg");
  const highlightedSection = highlighted("section");
  const highlightedDay = highlighted("day");
  // A leg row tap shows its leg above the half-raised sheet and marks the row.
  const selectLegRow = (index: number) => {
    const route = trip.legs[index]?.route;
    const area = route?.status === "routed" ? route.geometry : trip.points.slice(index, index + 2);
    dispatch({ type: "rowTapped", row: { kind: "leg", index } });
    raise();
    setFocus({ area, ...covered() });
  };
  // A section row tap does the same for the whole section, and a tap on the highlighted one of
  // several legs also opens it (#200). It always zooms, as the map may have been panned away.
  const [detailsSection, setDetailsSection] = useState<number | null>(null);
  // The sections showing their legs, by first leg as sections have no identity of their own: an
  // edit that leaves no section of several legs starting there closes it.
  const [openSections, setOpenSections] = useState<readonly number[]>([]);
  const stillOpen = openSections.filter((first) =>
    summary.sections.some((section) => section.firstLeg === first && section.lastLeg > first),
  );
  if (stillOpen.length !== openSections.length) setOpenSections(stillOpen);
  const toggleSection = (first: number) =>
    setOpenSections((open) => (open.includes(first) ? open.filter((leg) => leg !== first) : [...open, first]));
  const selectSectionRow = (index: number) => {
    const section = summary.sections[index];
    if (!section) return;
    if (index === highlightedSection && section.lastLeg > section.firstLeg) toggleSection(section.firstLeg);
    dispatch({ type: "rowTapped", row: { kind: "section", index } });
    raise();
    setFocus({ area: legsArea(trip, section), ...covered() });
  };
  // Entering access point editing opens the panel for this visit, or switches the sheet at its stop,
  // on the Access points tab; leaving restores the tab and the sheet's stop, and the panel shows its
  // stored state again. The session does it all, and clears the selections and drops the draft (ADR 0036).
  const enterAccessPointEditing = () => dispatch({ type: "enterAccessPointEditing" });
  const leaveAccessPointEditing = () => dispatch({ type: "leaveAccessPointEditing" });

  // A marker tap selects the point; while editing access points it also shows its row, raised to
  // half from the peek.
  const onSelectAccessPoint = (id: string) => {
    dispatch({ type: "accessPointClicked", id });
    if (editingAccessPoints) raiseFromPeek();
  };
  // A row tap shows the point on the map, above the half-raised sheet.
  const openAccessPoint = (id: string) => {
    const point = session.accessPoints.find((p) => p.id === id);
    if (!point) return;
    dispatch({ type: "accessPointClicked", id });
    raise();
    setFocus({ at: point.position, ...covered() });
  };
  // A day card tap shows the whole day on the map, above the half-raised sheet (#123).
  // Tapping the highlighted card again clears the highlight (the session does it).
  const openDay = (index: number) => {
    const day = summary.days[index];
    if (!day) return;
    dispatch({ type: "rowTapped", row: { kind: "day", index } });
    if (index === highlightedDay) return;
    raise();
    setFocus({ area: legsArea(trip, day), ...covered() });
  };

  // What the sheet holds, and the side panel instead when sideways (#126): the same content.
  const peekSummary = (
    <div className="planner-peek-summary">
      <TripTotals trip={summary.trip} />
    </div>
  );
  const tabList = (
    <TabList label={strings.planner.tabsLabel}>
      {(editingAccessPoints ? editingTabs : normalTabs).map((value) => (
        <Tab key={value} value={value} onPress={raiseFromPeek}>
          {strings.planner.tabs[value]}
        </Tab>
      ))}
    </TabList>
  );
  const sheetContent = (
    <div className="planner-tab-panels">
      {editingAccessPoints ? (
        <TabPanel value="accessPoints">
          <AccessPoints
            points={session.accessPoints}
            selectedId={session.selectedAccessPoint}
            storage={accessStorage}
            trip={trip}
            officialAires={layer.officialAires}
            position={position.state === "shown" ? position.at : null}
            onOpen={openAccessPoint}
            onOpenAire={layer.select}
            onEdit={(id) => {
              dispatch({ type: "accessPointClicked", id });
              setEditingId(id);
            }}
            onDelete={(id) => dispatch({ type: "accessPointDeleted", id })}
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
              highlightedSection={highlightedSection}
              highlightedLeg={highlightedLeg}
              open={stillOpen}
              onSelect={selectSectionRow}
              onSelectLeg={selectLegRow}
              onShowDetails={setDetailsSection}
              onShowLegDetails={setDetailsLeg}
              onRetry={(index) => dispatch({ type: "retryLeg", index })}
            />
          </TabPanel>
          <TabPanel value="days">
            {summary.days.length === 0 && <p className="planner-empty">{strings.daysPanelEmpty}</p>}
            <DaysPanel
              days={summary.days}
              access={waterAccess?.days}
              aire={aire}
              onSelectDay={openDay}
              highlightedDay={highlightedDay}
              // A day card's warning chip shows its leg's warnings in the dialog, over the Days tab (#58, #158).
              onShowLeg={setDetailsLeg}
            />
          </TabPanel>
        </>
      )}
    </div>
  );

  return (
    <div
      ref={root}
      className={
        sideways
          ? `planner planner-sideways ${panelOpen ? "planner-panel-open" : "planner-panel-collapsed"}`
          : `planner planner-stop-${stop}`
      }
      style={
        {
          "--side-panel-width": `${shownPanelWidth}px`,
          ...(peekPx === null ? {} : { "--sheet-peek": `${peekPx}px` }),
        } as CSSProperties
      }
    >
      <ClientTripMap
        baseMap={baseMap}
        overlays={overlays}
        trip={trip}
        tripGeneration={session.tripGeneration}
        onMapTap={onMapTap}
        selectedPoint={selectedPoint}
        onPointTap={(index) => dispatch({ type: "pointClicked", index })}
        onPointDrop={(index, to) => dispatch({ type: "movePoint", index, to })}
        onLegHold={(index, near) => dispatch({ type: "insertPoint", index, near })}
        selectedLeg={session.selectedLeg}
        onLegTap={(index) => dispatch({ type: "legClicked", index })}
        frozen={mapEdits.frozen}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
        accessPoints={{
          points: session.accessPoints,
          editable: mapEdits.accessPointsEditable,
          selectedId: session.selectedAccessPoint,
          onSelect: onSelectAccessPoint,
          onMove: (id, to) => dispatch({ type: "accessPointMoved", id, to, now: stamp().now }),
          draft: mapEdits.draft,
          onDraftMove: (to) => dispatch({ type: "draftMoved", to, now: stamp().now }),
        }}
        focus={focus}
        access={layer.shown && { ...layer.shown, selectedId: layer.selectedId, onSelect: layer.select }}
        searchResult={search.state.shown}
        searchCover={searchCover}
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
        {message && (
          <p role={message.kind} className={`planner-message planner-message-${message.kind}`}>
            {message.text}
          </p>
        )}
      </div>
      <div className="planner-buttons planner-buttons-bottom planner-buttons-left">
        {marking.locating && (
          <p role="status" className="planner-message">
            {strings.planner.markLocating}
          </p>
        )}
        {marking.needsTap && (
          <p role="status" className="planner-message">
            {strings.planner.markTapMap}
          </p>
        )}
        {editingAccessPoints && (
          <Button
            className="planner-fab"
            aria-label={strings.planner.markAccessPointButton}
            onClick={marking.mark}
            disabled={marking.locating}
          >
            <Icon icon={icons.accessPoint} />
          </Button>
        )}
        {/* Enters access point editing; while in it, coloured with an exit icon, it leaves it. */}
        <Button
          className={`planner-fab${editingAccessPoints ? " planner-fab-active" : ""}`}
          aria-label={strings.planner.editAccessPointsButton}
          aria-pressed={editingAccessPoints}
          onClick={editingAccessPoints ? leaveAccessPointEditing : enterAccessPointEditing}
        >
          <Icon icon={editingAccessPoints ? icons.leaveAccessPointEditing : icons.editAccessPoints} />
        </Button>
      </div>
      <div className="planner-buttons planner-buttons-bottom">
        {/* While editing access points the trip is frozen (#227): no undo or back to start. */}
        {/* The next leg's mode means nothing while the trip is frozen (ADR 0036). */}
        {!editingAccessPoints && (
          <ToggleGroup
            label={strings.planner.nextLegModeLabel}
            value={nextMode}
            options={legModeOptions}
            onChange={(mode) => dispatch({ type: "nextModePicked", mode })}
            className="planner-next-mode"
          />
        )}
        {/* Disabled, it stays a Tab stop and says why (#31). */}
        {!editingAccessPoints && (
          <Button
            className="planner-fab"
            aria-label={strings.undoButton}
            aria-describedby={canUndo(trip) ? undefined : undoReasonId}
            onClick={undo}
            disabled={!canUndo(trip)}
            focusableWhenDisabled
          >
            <Icon icon={icons.undo} />
          </Button>
        )}
        {/* Under undo, in the bottom corner; disabled like it, it says why. */}
        {!editingAccessPoints && (
          <Button
            className="planner-fab"
            aria-label={strings.planner.backToStartButton}
            aria-describedby={canGoBackToStart(trip) ? undefined : backToStartReasonId}
            onClick={() => dispatch({ type: "backToStart" })}
            disabled={!canGoBackToStart(trip)}
            focusableWhenDisabled
          >
            <Icon icon={icons.backToStart} />
          </Button>
        )}
        <span id={undoReasonId} hidden>
          {strings.undoDisabledReason}
        </span>
        <span id={backToStartReasonId} hidden>
          {strings.planner.backToStartDisabledReason}
        </span>
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
        leg={detailsLeg}
        summary={summary}
        access={waterAccess}
        aire={aire}
        onClose={() => setDetailsLeg(null)}
      />
      <SectionDetailsDialog
        section={detailsSection}
        summary={summary}
        access={waterAccess}
        aire={aire}
        onClose={() => setDetailsSection(null)}
      />
      <div className="planner-snap-offers">
        {/* The selected point's card; none while editing access points, which clears it. */}
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
        {/* The selected leg's mode (#230); none while editing access points, which clears it. */}
        {session.selectedLeg !== null && summary.legs[session.selectedLeg] && (
          <LegModeCard
            leg={session.selectedLeg}
            mode={trip.legs[session.selectedLeg].mode}
            distanceKm={summary.legs[session.selectedLeg].distanceKm}
            onChange={(mode) =>
              session.selectedLeg !== null &&
              dispatch({ type: "setLegMode", index: session.selectedLeg, mode })
            }
            onClose={() => dispatch({ type: "deselect" })}
          />
        )}
        <SnapOffers
          // None while editing access points; they wait until leaving (#227).
          offers={shownOffers(session)}
          onAccept={(offer) => dispatch({ type: "acceptOffer", offer })}
          onDecline={(offer) => dispatch({ type: "declineOffer", offer })}
        />
      </div>
      <Tabs
        value={shownTab(session)}
        onChange={(next: PlannerTab) => next !== "accessPoints" && dispatch({ type: "tabChosen", tab: next })}
      >
        {sideways ? (
          <SidePanel
            label={strings.planner.sheetLabel}
            open={panelOpen}
            onOpenChange={setPanelOpen}
            width={panelWidth}
            onWidthChange={(width) => changePanel({ width })}
            resizeLabel={strings.planner.resizePanelHandle}
            collapseLabel={strings.planner.collapsePanelButton}
            collapseIcon={<Icon icon={icons.collapsePanel} />}
            expandLabel={strings.planner.expandPanelButton}
            expandIcon={<Icon icon={icons.expandPanel} />}
            summary={peekSummary}
            header={tabList}
          >
            {sheetContent}
          </SidePanel>
        ) : (
          <BottomSheet
            label={strings.planner.sheetLabel}
            handleLabel={strings.planner.resizeSheetHandle}
            stopLabels={strings.planner.sheetStops}
            stop={stop}
            onStopChange={setStop}
            onPeekHeightChange={setPeekPx}
            peek={
              <>
                {peekSummary}
                {tabList}
              </>
            }
          >
            {sheetContent}
          </BottomSheet>
        )}
      </Tabs>
      <AccessPointDialog
        point={editing}
        unsaved={editingDraft}
        onSave={(id, changes) => {
          const { now } = stamp();
          if (!editingDraft) return dispatch({ type: "accessPointUpdated", id, changes, now });
          // The new point is stored and selected: show its row.
          dispatch({ type: "draftSaved", changes, now });
          raiseFromPeek();
        }}
        onClose={() => {
          setEditingId(null);
          setEditingDraft(false);
        }}
      />
    </div>
  );
}
