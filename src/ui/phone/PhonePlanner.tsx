"use client";

import { useState } from "react";
import type { Router } from "@/core/router";
import { canUndo, type LatLng } from "@/core/trip";
import ClientPhoneMap from "@/map/ClientPhoneMap";
import { BottomSheet, type SheetStop } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { formatDistance, formatTimeEstimate } from "../format";
import { strings } from "../strings";
import { usePlanner } from "../usePlanner";
import PhoneLegsList from "./PhoneLegsList";
import { positionMessage } from "./position";
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
  const { session, dispatch, summary, access, waterAccess, undo } = usePlanner(router);
  const { trip } = session;
  const [position, showPosition] = usePosition();
  const message = positionMessage(position);
  const [tab, setTab] = useState<PhoneTab>("legs");
  const [stop, setStop] = useState<SheetStop>("peek");

  // While an access point is being placed, the tap places it instead of adding a trip point.
  const onMapTap = (at: LatLng) => (access.placing ? access.placeAt(at) : dispatch({ type: "addPoint", at }));

  return (
    <div className={`phone phone-stop-${stop}`}>
      <ClientPhoneMap
        trip={trip}
        onMapTap={onMapTap}
        position={position.state === "shown" ? { at: position.at, accuracyM: position.accuracyM } : null}
        accessPoints={{
          points: access.points,
          selectedId: access.selected?.id ?? null,
          onSelect: access.select,
          onMove: (id, to) => access.update(id, { position: to }),
        }}
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
      <div className="phone-buttons phone-buttons-bottom">
        <Button className="phone-fab" aria-label={strings.undoButton} onClick={undo} disabled={!canUndo(trip)}>
          {strings.phone.undoGlyph}
        </Button>
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
              onRetry={(index) => dispatch({ type: "retryLeg", index })}
            />
          </TabPanel>
          <TabPanel value="days" />
          <TabPanel value="trip" />
          <TabPanel value="accessPoints" />
          <TabPanel value="settings" />
        </BottomSheet>
      </Tabs>
    </div>
  );
}
