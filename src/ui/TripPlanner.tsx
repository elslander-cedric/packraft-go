"use client";

import { useEffect, useState } from "react";
import type { Router } from "@/core/router";
import { createAutoRouter, retryLeg } from "@/core/routing";
import { summarise } from "@/core/summarise";
import { applyEdit, emptyTrip, type LatLng } from "@/core/trip";
import ClientTripMap from "@/map/ClientTripMap";
import { createBRouterRouter } from "@/routing/brouter";
import LegsPanel from "./LegsPanel";

/**
 * Holds the current trip and wires the map and the panel to the trip planner
 * core: the map sends edits, the core returns the new trip and its figures.
 * Legs without a route are routed through `router` whenever the trip changes.
 */
export default function TripPlanner({ router }: { router?: Router }) {
  const [trip, setTrip] = useState(emptyTrip);
  const [autoRouter] = useState(() => createAutoRouter(router ?? createBRouterRouter(), setTrip));

  useEffect(() => {
    void autoRouter.sync(trip);
  }, [autoRouter, trip]);

  const addPoint = (at: LatLng) => setTrip((current) => applyEdit(current, { type: "addPoint", at }));
  const retry = (legIndex: number) => {
    setTrip((current) => retryLeg(current, legIndex));
  };

  return (
    <div className="planner">
      <ClientTripMap trip={trip} onMapClick={addPoint} />
      <LegsPanel summary={summarise(trip)} legs={trip.legs} onRetry={retry} />
    </div>
  );
}
