"use client";

import { useState } from "react";
import type { Router } from "@/core/router";
import { canUndo, isCamp, type LatLng, type LegMode } from "@/core/trip";
import ClientPhoneMap from "@/map/ClientPhoneMap";
import type { MapFocus } from "@/map/PhoneMap";
import { BottomSheet, type SheetStop } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { ToggleGroup } from "../components/ToggleGroup";
import { formatDistance, formatTimeEstimate } from "../format";
import { strings } from "../strings";
import { usePlanner } from "../usePlanner";
import PhoneAccessPoints from "./PhoneAccessPoints";
import SnapOffers from "../SnapOffers";
import PhoneLegsList, { legModeOptions } from "./PhoneLegsList";
import { positionMessage } from "./position";
import { useMarkAccessPoint } from "./useMarkAccessPoint";
import { usePosition } from "./usePosition";
import "./phone.css";

type PhoneTab = keyof typeof strings.phone.tabs;
const tabs = Object.keys(strings.phone.tabs) as PhoneTab[];

/**
 * The phone layout of the planner (portrait; ADR 0026): a full-screen map with
 * a bottom sheet over it. Like the desktop layout it draws what `usePlanner`
 * returns and sends it actions; it adds no planning rules.
 */
export default function PhonePlanner({ router }: { router?: Router }) {
  const { session, dispatch, summary, access, waterAccess, aire, undo, deleteSelectedPoint } = usePlanner(router);
  const { trip, selectedPoint, offers } = session;
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  const [tab, setTab] = useState<PhoneTab>("legs");
  const [stop, setStop] = useState<SheetStop>("peek");
  const marking = useMarkAccessPoint(access, position, showPosition);
  // Where the map last zoomed to, for an access point row (#119).
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Your access points changed since opening, for "Saved on this device" (the hook saves every change).
  // Kept here, not in the tab, which is unmounted while another tab is open.
  const [seenPoints, setSeenPoints] = useState(access.points);
  const [pointsChanged, setPointsChanged] = useState(false);
  if (access.points !== seenPoints) {
    setSeenPoints(access.points);
    setPointsChanged(true);
  }

  // The next leg's mode (#121): the last leg's mode until the planner picks another, which holds
  // until a leg is added with it.
  const [pickedMode, setPickedMode] = useState<LegMode | null>(null);
  const nextMode = pickedMode ?? trip.legs[trip.legs.length - 1]?.mode ?? "hike";
  // The open leg row (#121); only one at a time, and none once its leg is gone.
  const [openLegState, setOpenLeg] = useState<number | null>(null);
  const openLeg = openLegState !== null && openLegState < trip.legs.length ? openLegState : null;

  // While an access point is being placed, the tap places it; while a point is selected, it only
  // clears the selection (#120); otherwise it adds a trip point with the next leg's mode.
  const onMapTap = (at: LatLng) => {
    if (access.placing) access.placeAt(at);
    else if (selectedPoint !== null) dispatch({ type: "deselect" });
    else {
      dispatch({ type: "addPoint", at, mode: nextMode });
      if (trip.points.length > 0) setPickedMode(null);
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
    const bounds = route?.status === "routed" ? route.geometry : trip.points.slice(index, index + 2);
    setStop("half");
    setFocus({ bounds, coveredBelow: 0.5 });
  };
  // With a route point selected, the access-point button saves that point as an access point (#120).
  const markSelectedPoint = () => {
    if (selectedPoint === null) return;
    access.placeAt(trip.points[selectedPoint]);
    dispatch({ type: "deselect" });
  };

  // A marker tap opens the point's details in the sheet, raised to half from the peek.
  const onSelectAccessPoint = (id: string) => {
    access.select(id);
    setTab("accessPoints");
    if (stop === "peek") setStop("half");
  };
  // A row tap shows the point on the map, above the half-raised sheet, with its details.
  const openAccessPoint = (id: string) => {
    const point = access.points.find((p) => p.id === id);
    if (!point) return;
    access.select(id);
    setStop("half");
    setFocus({ at: point.position, coveredBelow: 0.5 });
  };

  return (
    <div className={`phone phone-stop-${stop}`}>
      <ClientPhoneMap
        trip={trip}
        onMapTap={onMapTap}
        selectedPoint={selectedPoint}
        onPointTap={(index) => dispatch({ type: "pointClicked", index })}
        onPointDrop={(index, to) => dispatch({ type: "movePoint", index, to })}
        onLegHold={(leg, near) => dispatch({ type: "insertPoint", leg, near })}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
        accessPoints={{
          points: access.points,
          selectedId: access.selected?.id ?? null,
          onSelect: onSelectAccessPoint,
          onMove: (id, to) => access.update(id, { position: to }),
        }}
        focus={focus}
      />
      <div className="phone-buttons phone-buttons-top">
        <Button
          className="phone-fab"
          aria-label={strings.phone.showPositionButton}
          onClick={() => showPosition()}
          disabled={position.state === "locating"}
        >
          {strings.phone.showPositionGlyph}
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
          {strings.phone.markAccessPointGlyph}
        </Button>
      </div>
      <div className="phone-buttons phone-buttons-bottom">
        {selectedPoint !== null && (
          <>
            <Button className="phone-fab" aria-label={strings.deletePointButton} onClick={deleteSelectedPoint}>
              {strings.phone.deletePointGlyph}
            </Button>
            <Button
              className="phone-fab"
              aria-label={strings.campButton}
              aria-pressed={isCamp(trip, selectedPoint)}
              onClick={() => dispatch({ type: "toggleCampOnSelectedPoint" })}
            >
              {strings.phone.campGlyph}
            </Button>
          </>
        )}
        <ToggleGroup
          label={strings.phone.nextLegModeLabel}
          value={nextMode}
          options={legModeOptions}
          onChange={setPickedMode}
          className="phone-next-mode"
        />
        <Button className="phone-fab" aria-label={strings.undoButton} onClick={undo} disabled={!canUndo(trip)}>
          {strings.phone.undoGlyph}
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
        <BottomSheet
          label={strings.phone.sheetLabel}
          stop={stop}
          onStopChange={setStop}
          peek={
            <>
              <div className="phone-peek-summary">
                <h2 className="phone-trip-name">{trip.name || strings.tripNamePlaceholder}</h2>
                <p className="phone-totals">
                  <span>
                    <span className="visually-hidden">{`${strings.tripTotalDistance} `}</span>
                    {formatDistance(summary.trip.distanceKm)}
                  </span>
                  <span>
                    <span className="visually-hidden">{`${strings.tripTotalTimeEstimate} `}</span>
                    {formatTimeEstimate(summary.trip.timeH, summary.trip.timeStatus)}
                  </span>
                </p>
              </div>
              <TabList label={strings.phone.tabsLabel}>
                {tabs.map((value) => (
                  <Tab key={value} value={value} onPress={() => stop === "peek" && setStop("half")}>
                    {strings.phone.tabs[value]}
                  </Tab>
                ))}
              </TabList>
            </>
          }
        >
          <TabPanel value="legs">
            <PhoneLegsList
              summary={summary}
              legs={trip.legs}
              access={waterAccess}
              aire={aire}
              openLeg={openLeg}
              onOpen={openLegRow}
              onRetry={(index) => dispatch({ type: "retryLeg", index })}
              onSetMode={(index, mode) => dispatch({ type: "setLegMode", index, mode, accessPoints: access.points })}
            />
          </TabPanel>
          <TabPanel value="days" />
          <TabPanel value="trip" />
          <TabPanel value="accessPoints">
            <PhoneAccessPoints access={access} marking={marking} changed={pointsChanged} onOpen={openAccessPoint} />
          </TabPanel>
          <TabPanel value="settings" />
        </BottomSheet>
      </Tabs>
    </div>
  );
}
