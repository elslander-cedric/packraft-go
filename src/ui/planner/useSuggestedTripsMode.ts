"use client";

import { useState } from "react";
import type { PanelView, PlannerMode } from "@/core/plannerSession";

/**
 * Calls `onLeave` with the tab and sheet to return to when the session leaves suggested trips
 * for normal mode, closed or by using one (once the replace question is answered). It watches
 * the mode while rendering, so the planner restores its view in the same render.
 */
export function useSuggestedTripsMode(mode: PlannerMode, onLeave: (returnTo: PanelView) => void) {
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    if (shownMode.kind === "suggestedTrips" && mode.kind === "normal") {
      onLeave(shownMode.returnTo);
    }
  }
}
