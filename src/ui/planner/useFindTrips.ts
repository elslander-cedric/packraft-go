"use client";

import { useRef, useState } from "react";
import type { Bounds } from "@/core/geo";
import type { SearchArea } from "@/core/placeSearch";
import { defaultSettings, withTripWishes, type Settings, type TripWishes } from "@/core/settings";
import { localToday } from "../useAccessRules";
import { useSuggestedTrips, type SuggestionsState } from "./useSuggestedTrips";

export type FindTrips = ReturnType<typeof useFindTrips>;

/**
 * Find trips (ADR 0039): the trip wishes dialog, the search it starts in the visible map area,
 * and its answer. Entering and leaving the planner's mode for it is the planner's: `onShow` is
 * called when a search starts.
 */
export function useFindTrips(
  settings: Settings | null,
  saveSettings: (settings: Settings) => void,
  onShow: () => void,
) {
  // The visible map, kept as the map reports it, so a search covers what was shown at Find trips.
  const area = useRef<Bounds>([-180, -90, 180, 90]);
  const [asking, setAsking] = useState(false);
  const [search, setSearch] = useState<{
    wishes: TripWishes;
    date: string;
    area: Bounds;
  } | null>(null);
  const state: SuggestionsState = useSuggestedTrips(search, settings ?? defaultSettings);

  return {
    /** The wishes dialog is open. */
    asking,
    ask: () => setAsking(true),
    cancel: () => setAsking(false),
    wishes: settings?.tripWishes ?? defaultSettings.tripWishes,
    today: localToday(),
    /** Remembers the wishes (not the date) and searches the area shown now. */
    confirm: (wishes: TripWishes, date: string) => {
      if (settings) saveSettings(withTripWishes(settings, wishes));
      setSearch({ wishes, date, area: area.current });
      setAsking(false);
      onShow();
    },
    close: () => setSearch(null),
    state,
    /** The map moved. */
    setArea: ({ west, south, east, north }: SearchArea) => {
      area.current = [west, south, east, north];
    },
  };
}
