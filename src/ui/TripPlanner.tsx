"use client";

import { useState } from "react";
import { summarise } from "@/core/summarise";
import { applyEdit, emptyTrip, type LatLng } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import LegsPanel from "./LegsPanel";

/**
 * Holds the current trip and wires the map and the panel to the trip planner
 * core: the map sends edits, the core returns the new trip and its figures.
 */
export default function TripPlanner() {
  const [trip, setTrip] = useState(emptyTrip);

  const addPoint = (at: LatLng) => setTrip((current) => applyEdit(current, { type: "addPoint", at }));

  return (
    <div className="planner">
      <ClientTripMap trip={trip} onMapClick={addPoint} />
      <LegsPanel summary={summarise(trip)} />
    </div>
  );
}
