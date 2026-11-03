"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import {
  editingAccessPoints as isEditingAccessPoints,
  normalTabs,
  type NormalTab,
  type SheetStop,
} from "@/core/plannerSession";
import type { Router } from "@/core/router";
import { canGoBackToStart, canUndo, isCamp, type LatLng, type LegMode, type Trip } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import type { MapFocus } from "@/map/TripMap";
import type { MapCover } from "@/map/SearchResultLayer";
import { BottomSheet, sheetStopShare } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { SidePanel, useSidePanelWidth } from "../components/SidePanel";
import { sidePanelCover } from "../components/sidePanelWidth";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { ToggleGroup, type ToggleOption } from "../components/ToggleGroup";
import DaysPanel from "../DaysPanel";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import { useAccessLayer } from "../useAccessLayer";
import { useBaseMap, useOverlays, useSidePanel } from "../useSettings";
import { usePlaceSearch } from "../usePlaceSearch";
import { usePlanner } from "../usePlanner";
import AccessChip from "./AccessChip";
import AccessDetailsDialog from "./AccessDetailsDialog";
import AccessPointDialog from "./AccessPointDialog";
import AccessPoints from "./AccessPoints";
import SnapOffers from "../SnapOffers";
import { MapNotCheckedNote } from "../TripAccessView";
import LegDetailsDialog from "./LegDetailsDialog";
import SectionDetailsDialog from "./SectionDetailsDialog";
import SectionsList from "./SectionsList";
import MapMenu from "./MapMenu";
import PlannerMenu from "./PlannerMenu";
import PlaceSearch from "./PlaceSearch";
import TripTotals from "./TripTotals";
import { positionMessage } from "./position";
import { useMarkAccessPoint } from "./useMarkAccessPoint";
import { useSideways } from "./usePlannerLayout";
import { usePosition } from "./usePosition";
import "./planner.css";

/** A tab of normal mode (`normalTabs`, in the core), or the Access points tab of access point editing. */
type PlannerTab = NormalTab | "accessPoints";
const editingTabs: readonly PlannerTab[] = ["accessPoints"];

/**
 * The next leg's mode the planner picked, and the trip state it was picked for: the trip's
 * points and undo steps, which every edit, undo, New trip and Open trip replace, and routing keeps.
 */
type NextModePick = {
  mode: LegMode;
  points: Trip["points"];
  undoSteps: Trip["undoSteps"];
  /** The first point is being added: the pick carries over to the trip with that point. */
  carry?: boolean;
};
const pickedFor = (trip: Trip) => ({ points: trip.points, undoSteps: trip.undoSteps });
const pickHolds = (pick: NextModePick, trip: Trip) => pick.points === trip.points && pick.undoSteps === trip.undoSteps;

/** Hike / Paddle, icon-only, in the legs' colours: the map's next leg toggle. */
const legModeOptions: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, icon: <Icon icon={icons.hike} />, className: "leg-mode leg-mode-hike" },
  {
    value: "paddle",
    label: strings.legModePaddle,
    icon: <Icon icon={icons.paddle} />,
    className: "leg-mode leg-mode-paddle",
  },
];

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
  const { trip, selectedPoint, offers } = session;
  const undoReasonId = useId();
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  // Access point editing (ADR 0036): the planner's other mode, kept in the planner session.
  const editingAccessPoints = isEditingAccessPoints(session);
  // Normal mode's tab; kept while editing access points, so Done brings it back.
  const [tab, setTab] = useState<NormalTab>("sections");
  const shownTab: PlannerTab = editingAccessPoints ? "accessPoints" : tab;
  // The sheet's last stop; kept while sideways, so turning back to portrait restores it (#126).
  const [stop, setStop] = useState<SheetStop>("peek");
  // The peek's height, so the bottom buttons sit just above it.
  const [peekPx, setPeekPx] = useState<number | null>(null);
  // Except on a narrow screen in portrait, the side panel replaces the sheet (ADR 0034). Its width
  // and whether it is open are settings on this device, kept as they were whatever the sheet's stop.
  const sideways = useSideways();
  const [{ width: panelWidth, open: storedPanelOpen }, changePanel] = useSidePanel();
  // While editing access points the panel's open state is not stored: a reload made while editing
  // comes back in normal mode with the panel as it was before entering (ADR 0036).
  const [panelOpenWhileEditing, setPanelOpenWhileEditing] = useState(true);
  const panelOpen = editingAccessPoints ? panelOpenWhileEditing : storedPanelOpen;
  const setPanelOpen = (open: boolean) =>
    editingAccessPoints ? setPanelOpenWhileEditing(open) : changePanel({ open });
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
  // The access point open in the edit dialog, if any.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === null ? null : (access.points.find((p) => p.id === editingId) ?? null);
  // A new access point opens its edit dialog, over its row in the Access points tab.
  const placed = (id: string) => {
    setEditingId(id);
    raiseFromPeek();
  };
  const marking = useMarkAccessPoint(access, position, showPosition, placed);
  // The access layer (#125): on or off, its date, and the water or lock whose details are open.
  const layer = useAccessLayer(trip, editingAccessPoints);
  // The base map (ADR 0031): a setting on this device, never in the trip.
  const [baseMap, chooseBaseMap] = useBaseMap();
  // The overlays (ADR 0032): settings on this device too.
  const [overlays, switchOverlay] = useOverlays();
  // Where the map last zoomed to, for an access point row (#119).
  const [focus, setFocus] = useState<MapFocus | null>(null);

  // The next leg's mode (#121): the last leg's mode (hike for an empty trip), unless the planner
  // picked another since the trip last changed. Any edit (adding a leg with it, delete, undo…),
  // New trip and Open trip drop the pick; routing doesn't. Only the first point, which adds no leg,
  // carries it over to the second.
  const [pick, setPick] = useState<NextModePick | null>(null);
  let held = pick;
  if (pick !== null && !pickHolds(pick, trip)) {
    held = pick.carry && trip.points.length === 1 ? { mode: pick.mode, ...pickedFor(trip) } : null;
    setPick(held);
  }
  const nextMode = held?.mode ?? trip.legs[trip.legs.length - 1]?.mode ?? "hike";
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

  // While an access point is being placed, the tap places it; while editing access points it
  // does nothing else, as the trip is frozen (#227); while a point is selected, it only clears the
  // selection (#120); otherwise it adds a trip point with the next leg's mode.
  const onMapTap = (at: LatLng) => {
    if (access.placing) placed(access.placeAt(at));
    else if (editingAccessPoints) return;
    else if (selectedPoint !== null) dispatch({ type: "deselect" });
    else {
      if (held !== null && trip.points.length === 0) setPick({ ...held, carry: true });
      dispatch({ type: "addPoint", at, mode: nextMode, accessPoints: access.points, officialAires });
    }
  };
  // A leg row tap shows its leg above the half-raised sheet and marks the row.
  const [selectedLeg, setSelectedLeg] = useState<number | undefined>(undefined);
  const selectLegRow = (index: number) => {
    const route = trip.legs[index]?.route;
    const area = route?.status === "routed" ? route.geometry : trip.points.slice(index, index + 2);
    setSelectedLeg(index);
    setSelectedSection(undefined);
    raise();
    setFocus({ area, ...covered() });
  };
  // A section row tap does the same for the whole section, and a tap on the selected one of
  // several legs also opens it (#200). It always zooms, as the map may have been panned away.
  const [selectedSection, setSelectedSection] = useState<number | undefined>(undefined);
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
    if (index === selectedSection && section.lastLeg > section.firstLeg) toggleSection(section.firstLeg);
    setSelectedSection(index);
    setSelectedLeg(undefined);
    raise();
    setFocus({ area: legsArea(trip, section), ...covered() });
  };
  // Entering access point editing opens the panel or sheet on the Access points tab; Done
  // restores the tab and the panel or sheet as they were. Both clear the selection (ADR 0036).
  const enterAccessPointEditing = () => {
    dispatch({ type: "enterAccessPointEditing", returnTo: { tab, sheet: stop } });
    access.select(null);
    // The panel opens for this visit only; the stored setting keeps the earlier state.
    setPanelOpenWhileEditing(true);
    if (!sideways && stop === "peek") setStop("half");
  };
  const leaveAccessPointEditing = () => {
    if (session.mode.kind === "normal") return;
    const { returnTo } = session.mode;
    dispatch({ type: "leaveAccessPointEditing" });
    access.select(null);
    if (access.placing) access.togglePlacing();
    setTab(returnTo.tab);
    setStop(returnTo.sheet);
    // The stored panel state was left as it was on entering, so normal mode shows it again.
  };

  // A marker tap selects the point; while editing access points it also shows its row, raised to
  // half from the peek.
  const onSelectAccessPoint = (id: string) => {
    access.select(id);
    if (editingAccessPoints) raiseFromPeek();
  };
  // A row tap shows the point on the map, above the half-raised sheet.
  const openAccessPoint = (id: string) => {
    const point = access.points.find((p) => p.id === id);
    if (!point) return;
    access.select(id);
    raise();
    setFocus({ at: point.position, ...covered() });
  };
  // A day card tap shows the whole day on the map, above the half-raised sheet (#123).
  // Tapping the selected card again unselects it.
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);
  const openDay = (index: number) => {
    const day = summary.days[index];
    if (!day) return;
    if (index === selectedDay) {
      setSelectedDay(undefined);
      return;
    }
    setSelectedDay(index);
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
            access={access}
            trip={trip}
            officialAires={layer.officialAires}
            position={position.state === "shown" ? position.at : null}
            onOpen={openAccessPoint}
            onOpenAire={layer.select}
            onEdit={(id) => {
              access.select(id);
              setEditingId(id);
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
              selected={selectedSection}
              selectedLeg={selectedLeg}
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
              selectedDay={selectedDay}
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
        onMapTap={onMapTap}
        selectedPoint={selectedPoint}
        onPointTap={(index) => dispatch({ type: "pointClicked", index })}
        onPointDrop={(index, to) => dispatch({ type: "movePoint", index, to })}
        onLegHold={(index, near) => dispatch({ type: "insertPoint", index, near })}
        frozen={editingAccessPoints}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
        accessPoints={{
          points: access.points,
          editable: editingAccessPoints,
          selectedId: access.selected?.id ?? null,
          onSelect: onSelectAccessPoint,
          onMove: (id, to) => access.update(id, { position: to }),
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
        {access.placing && (
          // Cancel sits beside the live region, so it isn't read out as part of the state.
          <div className="planner-message planner-state-line">
            <span role="status">{`${strings.planner.placingState} ·`}</span>
            <Button className="planner-state-action" onClick={access.togglePlacing}>
              {strings.planner.placingCancel}
            </Button>
          </div>
        )}
        {/* While editing access points the trip is frozen (#227): no back to start, delete, camp or undo. */}
        {!editingAccessPoints && canGoBackToStart(trip) && (
          <Button
            className="planner-fab"
            aria-label={strings.planner.backToStartButton}
            onClick={() => dispatch({ type: "backToStart", mode: nextMode })}
          >
            <Icon icon={icons.backToStart} />
          </Button>
        )}
        {editingAccessPoints ? (
          <>
            {/* Done sits beside the live region, so it isn't read out as part of the state. */}
            <div className="planner-message planner-state-line">
              <span role="status">{strings.planner.editingAccessPointsState}</span>
              <Button className="planner-state-action" onClick={leaveAccessPointEditing}>
                {strings.planner.editingAccessPointsDone}
              </Button>
            </div>
            <Button
              className="planner-fab"
              aria-label={strings.planner.markAccessPointButton}
              onClick={marking.mark}
              disabled={marking.locating}
            >
              <Icon icon={icons.accessPoint} />
            </Button>
          </>
        ) : (
          <Button
            className="planner-fab"
            aria-label={strings.planner.editAccessPointsButton}
            onClick={enterAccessPointEditing}
          >
            <Icon icon={icons.editAccessPoints} />
          </Button>
        )}
      </div>
      <div className="planner-buttons planner-buttons-bottom">
        {!editingAccessPoints && selectedPoint !== null && (
          <>
            <Button className="planner-fab" aria-label={strings.deletePointButton} onClick={deleteSelectedPoint}>
              <Icon icon={icons.deletePoint} />
            </Button>
            <Button
              className="planner-fab"
              aria-label={strings.campButton}
              aria-pressed={isCamp(trip, selectedPoint)}
              onClick={() => dispatch({ type: "toggleCampOnSelectedPoint" })}
            >
              <Icon icon={icons.camp} />
            </Button>
          </>
        )}
        <ToggleGroup
          label={strings.planner.nextLegModeLabel}
          value={nextMode}
          options={legModeOptions}
          onChange={(mode) => setPick({ mode, ...pickedFor(trip) })}
          className="planner-next-mode"
        />
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
        <span id={undoReasonId} hidden>
          {strings.undoDisabledReason}
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
        <SnapOffers
          // Hidden while editing access points; they wait for Done (#227).
          offers={editingAccessPoints ? [] : offers}
          onAccept={(offer) => dispatch({ type: "acceptOffer", offer })}
          onDecline={(offer) => dispatch({ type: "declineOffer", offer })}
        />
      </div>
      <Tabs value={shownTab} onChange={(next) => next !== "accessPoints" && setTab(next)}>
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
      <AccessPointDialog point={editing} onSave={access.update} onClose={() => setEditingId(null)} />
    </div>
  );
}
