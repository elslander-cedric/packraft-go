"use client";

import { useState, type CSSProperties } from "react";
import type { Router } from "@/core/router";
import type { DaySummary } from "@/core/summarise";
import { canUndo, isCamp, type LatLng, type LegMode, type Trip } from "@/core/trip";
import ClientPhoneMap from "@/map/ClientPhoneMap";
import type { MapFocus } from "@/map/PhoneMap";
import { BottomSheet, type SheetStop } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { SidePanel, sidePanelCover } from "../components/SidePanel";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { ToggleGroup, type ToggleOption } from "../components/ToggleGroup";
import DaysPanel from "../DaysPanel";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import { useAccessLayer } from "../useAccessLayer";
import { usePlanner } from "../usePlanner";
import PhoneAccessChip from "./PhoneAccessChip";
import PhoneAccessDetails from "./PhoneAccessDetails";
import PhoneAccessPointDialog from "./PhoneAccessPointDialog";
import PhoneAccessPoints from "./PhoneAccessPoints";
import SnapOffers from "../SnapOffers";
import type { ShownLeg } from "../shownLeg";
import PhoneLegsList from "./PhoneLegsList";
import PhoneMenu from "./PhoneMenu";
import PhoneTripTotals from "./PhoneTripTotals";
import { positionMessage } from "./position";
import { useMarkAccessPoint } from "./useMarkAccessPoint";
import { useSideways } from "./usePhoneLayout";
import { usePosition } from "./usePosition";
import "./phone.css";

type PhoneTab = keyof typeof strings.phone.tabs;
const tabs = Object.keys(strings.phone.tabs) as PhoneTab[];

/**
 * The next leg's mode the planner picked, and the trip state it was picked for: the trip's
 * points and undo steps, which every edit, undo, New trip and Open… replace, and routing keeps.
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

/** Hike / Paddle, icon-only, coloured as the desktop's mode switch: the map's next leg toggle. */
const legModeOptions: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, icon: <Icon icon={icons.hike} />, className: "leg-mode leg-mode-hike" },
  {
    value: "paddle",
    label: strings.legModePaddle,
    icon: <Icon icon={icons.paddle} />,
    className: "leg-mode leg-mode-paddle",
  },
];

/** Where a day goes: its points and its legs' routes. */
function dayArea(trip: Trip, day: DaySummary): LatLng[] {
  const area: LatLng[] = trip.points.slice(day.firstLeg, day.lastLeg + 2);
  for (const leg of trip.legs.slice(day.firstLeg, day.lastLeg + 1))
    if (leg.route?.status === "routed") area.push(...leg.route.geometry);
  return area;
}

/**
 * The phone layout of the planner (ADR 0026): a full-screen map with a bottom
 * sheet over it, or, held sideways, a side panel on its right (#126). Like the
 * desktop layout it draws what `usePlanner` returns and sends it actions; it
 * adds no planning rules.
 */
export default function PhonePlanner({ router }: { router?: Router }) {
  const {
    session,
    dispatch,
    summary,
    settings,
    saveSettings,
    access,
    waterAccess,
    aire,
    undo,
    deleteSelectedPoint,
    saveFile,
    exportGpx,
    openFile,
  } = usePlanner(router);
  const { trip, selectedPoint, offers } = session;
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  const [tab, setTab] = useState<PhoneTab>("legs");
  // The sheet's last stop; kept while sideways, so turning back to portrait restores it (#126).
  const [stop, setStop] = useState<SheetStop>("peek");
  // The peek's height, so the bottom buttons sit just above it.
  const [peekPx, setPeekPx] = useState<number | null>(null);
  // Held sideways, the side panel replaces the sheet: open when the sheet was above its peek.
  const sideways = useSideways();
  const [panelOpen, setPanelOpen] = useState(false);
  const [wasSideways, setWasSideways] = useState(sideways);
  if (sideways !== wasSideways) {
    setWasSideways(sideways);
    if (sideways) setPanelOpen(stop !== "peek");
  }
  // Shows the content: the sheet raised to half, or the panel opened.
  const raise = () => (sideways ? setPanelOpen(true) : setStop("half"));
  // The same, but a sheet above the peek stays where it is.
  const raiseFromPeek = () => {
    if (sideways) setPanelOpen(true);
    else if (stop === "peek") setStop("half");
  };
  // How much of the map the raised sheet or the open panel covers, for a map focus.
  const covered = () =>
    sideways ? { coveredBelow: 0, coveredRight: sidePanelCover(window.innerWidth) } : { coveredBelow: 0.5 };
  // The access point open in the edit dialog, if any.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === null ? null : (access.points.find((p) => p.id === editingId) ?? null);
  // A new access point opens its edit dialog, over its row in the Access points tab.
  const placed = (id: string) => {
    setEditingId(id);
    setTab("accessPoints");
    raiseFromPeek();
  };
  const marking = useMarkAccessPoint(access, position, showPosition, placed);
  // The access layer (#125): on or off, its date, and the water or lock whose details are open.
  const layer = useAccessLayer(trip);
  const detailsOpen = layer.selectedWater !== undefined || layer.selectedLock !== undefined;
  // Where the map last zoomed to, for an access point row (#119).
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Your access points changed since opening, for "Saved on this device" (the hook saves every Save at once).
  // Kept here, not in the tab, which is unmounted while another tab is open.
  const [seenPoints, setSeenPoints] = useState(access.points);
  const [pointsChanged, setPointsChanged] = useState(false);
  if (access.points !== seenPoints) {
    setSeenPoints(access.points);
    setPointsChanged(true);
  }

  // The next leg's mode (#121): the last leg's mode (hike for an empty trip), unless the planner
  // picked another since the trip last changed. Any edit (adding a leg with it, delete, undo…),
  // New trip and Open… drop the pick; routing doesn't. Only the first point, which adds no leg,
  // carries it over to the second.
  const [pick, setPick] = useState<NextModePick | null>(null);
  let held = pick;
  if (pick !== null && !pickHolds(pick, trip)) {
    held = pick.carry && trip.points.length === 1 ? { mode: pick.mode, ...pickedFor(trip) } : null;
    setPick(held);
  }
  const nextMode = held?.mode ?? trip.legs[trip.legs.length - 1]?.mode ?? "hike";
  // The open leg row (#121); only one at a time, and none once its leg is gone.
  const [openLegState, setOpenLeg] = useState<number | null>(null);
  const openLeg = openLegState !== null && openLegState < trip.legs.length ? openLegState : null;

  // While an access point is being placed, the tap places it; while a point is selected, it only
  // clears the selection (#120); otherwise it adds a trip point with the next leg's mode.
  const onMapTap = (at: LatLng) => {
    if (access.placing) placed(access.placeAt(at));
    else if (selectedPoint !== null) dispatch({ type: "deselect" });
    else {
      if (held !== null && trip.points.length === 0) setPick({ ...held, carry: true });
      dispatch({ type: "addPoint", at, mode: nextMode, accessPoints: access.points });
    }
  };
  // A leg row tap opens it (closing any other) and shows its leg above the half-raised sheet.
  const openLegRow = (index: number) => {
    if (index === openLeg) {
      setOpenLeg(null);
      return;
    }
    setOpenLeg(index);
    const route = trip.legs[index]?.route;
    const area = route?.status === "routed" ? route.geometry : trip.points.slice(index, index + 2);
    raise();
    setFocus({ area, ...covered() });
  };
  // A day card's warning chip opens its leg in the Legs tab, scrolled to the top, with its warnings (#58).
  const [shownLeg, setShownLeg] = useState<ShownLeg | null>(null);
  const showLeg = (index: number) => {
    setTab("legs");
    if (index !== openLeg) openLegRow(index);
    setShownLeg({ leg: index, seq: (shownLeg?.seq ?? 0) + 1 });
  };
  // With a route point selected, the access-point button saves that point as an access point (#120).
  const markSelectedPoint = () => {
    if (selectedPoint === null) return;
    const id = access.placeAt(trip.points[selectedPoint]);
    dispatch({ type: "deselect" });
    placed(id);
  };

  // A marker tap shows the point's row in the Access points tab, raised to half from the peek.
  const onSelectAccessPoint = (id: string) => {
    layer.select(null);
    access.select(id);
    setTab("accessPoints");
    raiseFromPeek();
  };
  // A row tap shows the point on the map, above the half-raised sheet.
  const openAccessPoint = (id: string) => {
    const point = access.points.find((p) => p.id === id);
    if (!point) return;
    access.select(id);
    raise();
    setFocus({ at: point.position, ...covered() });
  };
  // Holding a water or tapping a lock opens its details in the sheet at half, from any stop,
  // above the open tab (#125, story 81); sideways, in the opened panel.
  const openAccessDetails = (id: string) => {
    layer.select(id);
    raise();
  };
  // A tab press goes to that tab, so it closes any water or lock details over it.
  const pressTab = () => {
    layer.select(null);
    raiseFromPeek();
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
    setFocus({ area: dayArea(trip, day), ...covered() });
  };

  // What the sheet holds, and the side panel instead when sideways (#126): the same content.
  const peekSummary = (
    <div className="phone-peek-summary">
      <PhoneTripTotals trip={summary.trip} />
    </div>
  );
  const tabList = (
    <TabList label={strings.phone.tabsLabel}>
      {tabs.map((value) => (
        <Tab key={value} value={value} onPress={pressTab}>
          {strings.phone.tabs[value]}
        </Tab>
      ))}
    </TabList>
  );
  const sheetContent = (
    <>
      <PhoneAccessDetails
        water={layer.selectedWater}
        lock={layer.selectedLock}
        date={layer.date}
        onClose={() => layer.select(null)}
      />
      <div className="phone-tab-panels" hidden={detailsOpen}>
        <TabPanel value="legs">
          <PhoneLegsList
            summary={summary}
            legs={trip.legs}
            access={waterAccess}
            aire={aire}
            openLeg={openLeg}
            onOpen={openLegRow}
            shownLeg={shownLeg}
            onRetry={(index) => dispatch({ type: "retryLeg", index })}
          />
        </TabPanel>
        <TabPanel value="days">
          <DaysPanel
            days={summary.days}
            access={waterAccess?.days}
            aire={aire}
            onSelectDay={openDay}
            selectedDay={selectedDay}
            heading={false}
            onShowLeg={showLeg}
          />
          {/* The disclaimer follows the day cards and their warning chips (#123). */}
          {waterAccess && summary.days.length > 0 && <p className="phone-disclaimer">{strings.navigationRulesNotice}</p>}
        </TabPanel>
        <TabPanel value="accessPoints">
          <PhoneAccessPoints
            access={access}
            changed={pointsChanged}
            onOpen={openAccessPoint}
            onEdit={(id) => {
              access.select(id);
              setEditingId(id);
            }}
          />
        </TabPanel>
      </div>
    </>
  );

  return (
    <div
      className={
        sideways
          ? `phone phone-sideways ${panelOpen ? "phone-panel-open" : "phone-panel-collapsed"}`
          : `phone phone-stop-${stop}`
      }
      style={peekPx === null ? undefined : ({ "--sheet-peek": `${peekPx}px` } as CSSProperties)}
    >
      <ClientPhoneMap
        trip={trip}
        onMapTap={onMapTap}
        selectedPoint={selectedPoint}
        onPointTap={(index) => dispatch({ type: "pointClicked", index })}
        onPointDrop={(index, to) => dispatch({ type: "movePoint", index, to })}
        onLegHold={(index, near) => dispatch({ type: "insertPoint", index, near })}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
        accessPoints={{
          points: access.points,
          selectedId: access.selected?.id ?? null,
          onSelect: onSelectAccessPoint,
          onMove: (id, to) => access.update(id, { position: to }),
        }}
        focus={focus}
        access={layer.shown && { ...layer.shown, selectedId: layer.selectedId, onSelect: openAccessDetails }}
      />
      {layer.on && (
        <div className="phone-access-chip-slot">
          <PhoneAccessChip dateSelector={layer.dateSelector} />
        </div>
      )}
      <div className="phone-buttons phone-buttons-top phone-buttons-left">
        <PhoneMenu
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
      </div>
      <div className="phone-buttons phone-buttons-top">
        <Button
          className="phone-fab"
          aria-label={strings.phone.showPositionButton}
          onClick={() => showPosition()}
          disabled={position.state === "locating"}
        >
          <Icon icon={icons.showPosition} />
        </Button>
        <Button
          className="phone-fab"
          aria-label={strings.accessLayerToggle}
          aria-pressed={layer.on}
          onClick={() => layer.setOn(!layer.on)}
        >
          <Icon icon={icons.accessLayer} />
        </Button>
        {message && (
          <p role={message.kind} className={`phone-message phone-message-${message.kind}`}>
            {message.text}
          </p>
        )}
      </div>
      <div className="phone-buttons phone-buttons-bottom phone-buttons-left">
        {marking.locating && (
          <p role="status" className="phone-message">
            {strings.phone.markLocating}
          </p>
        )}
        {access.placing && (
          // Cancel sits beside the live region, so it isn't read out as part of the state.
          <div className="phone-message phone-state-line">
            <span role="status">{`${strings.phone.placingState} ·`}</span>
            <Button className="phone-state-action" onClick={access.togglePlacing}>
              {strings.phone.placingCancel}
            </Button>
          </div>
        )}
        <Button
          className="phone-fab"
          aria-label={
            selectedPoint === null
              ? strings.phone.markAccessPointButton
              : strings.phone.selectedPointToAccessPointButton
          }
          onClick={selectedPoint === null ? marking.mark : markSelectedPoint}
          disabled={selectedPoint === null && marking.locating}
        >
          <Icon icon={icons.accessPoint} />
        </Button>
      </div>
      <div className="phone-buttons phone-buttons-bottom">
        {selectedPoint !== null && (
          <>
            <Button className="phone-fab" aria-label={strings.deletePointButton} onClick={deleteSelectedPoint}>
              <Icon icon={icons.deletePoint} />
            </Button>
            <Button
              className="phone-fab"
              aria-label={strings.campButton}
              aria-pressed={isCamp(trip, selectedPoint)}
              onClick={() => dispatch({ type: "toggleCampOnSelectedPoint" })}
            >
              <Icon icon={icons.camp} />
            </Button>
          </>
        )}
        <ToggleGroup
          label={strings.phone.nextLegModeLabel}
          value={nextMode}
          options={legModeOptions}
          onChange={(mode) => setPick({ mode, ...pickedFor(trip) })}
          className="phone-next-mode"
        />
        <Button className="phone-fab" aria-label={strings.undoButton} onClick={undo} disabled={!canUndo(trip)}>
          <Icon icon={icons.undo} />
        </Button>
      </div>
      <div className="phone-snap-offers">
        <SnapOffers
          offers={offers}
          onAccept={(offer) => dispatch({ type: "acceptOffer", offer })}
          onDecline={(offer) => dispatch({ type: "declineOffer", offer })}
        />
      </div>
      <Tabs value={tab} onChange={setTab}>
        {sideways ? (
          <SidePanel
            label={strings.phone.sheetLabel}
            open={panelOpen}
            onOpenChange={setPanelOpen}
            collapseLabel={strings.phone.collapsePanelButton}
            collapseIcon={<Icon icon={icons.collapsePanel} />}
            expandLabel={strings.phone.expandPanelButton}
            expandIcon={<Icon icon={icons.expandPanel} />}
            summary={peekSummary}
            header={tabList}
          >
            {sheetContent}
          </SidePanel>
        ) : (
          <BottomSheet
            label={strings.phone.sheetLabel}
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
      <PhoneAccessPointDialog point={editing} onSave={access.update} onClose={() => setEditingId(null)} />
    </div>
  );
}
