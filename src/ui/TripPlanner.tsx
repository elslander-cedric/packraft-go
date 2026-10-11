"use client";

import { useEffect, useState } from "react";
import { summarise } from "@/core/summarise";
import { applyEdit, canUndo, emptyTrip, type Edit, type LatLng } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import EditToolbar from "./EditToolbar";
import LegsPanel from "./LegsPanel";

/** True when a key press is meant for a text field, not for the planner. */
const typingInField = (event: KeyboardEvent) =>
  event.target instanceof HTMLElement &&
  (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));

/**
 * Holds the current trip and wires the map, toolbar and panel to the trip
 * planner core: they send edits, the core returns the new trip and its figures.
 * The selected point is UI state only; it is cleared by every edit.
 */
export default function TripPlanner() {
  const [trip, setTrip] = useState(emptyTrip);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const edit = (change: Edit) => {
    setTrip((current) => applyEdit(current, change));
    setSelectedPoint(null);
  };
  const undo = () => edit({ type: "undo" });
  const deleteSelectedPoint = () => {
    if (selectedPoint !== null) edit({ type: "deletePoint", index: selectedPoint });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (typingInField(event)) return;
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
        <EditToolbar
          canUndo={canUndo(trip)}
          canDeletePoint={selectedPoint !== null}
          onUndo={undo}
          onDeletePoint={deleteSelectedPoint}
        />
        <LegsPanel summary={summarise(trip)} />
      </div>
    </div>
  );
}
