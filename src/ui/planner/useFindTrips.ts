"use client";

import { useRef, useState } from "react";
import type { AccessPoints } from "@/core/accessPoints";
import type { Bounds } from "@/core/geo";
import type { SearchArea } from "@/core/placeSearch";
import { defaultSettings, withTripWishes, type Settings, type TripWishes } from "@/core/settings";
import { localToday } from "../useAccessRules";
import { useSuggestedTrips, type SuggestedTripsState, type TripSearch } from "./useSuggestedTrips";

export type FindTrips = ReturnType<typeof useFindTrips>;

/**
 * Find trips (ADR 0039): the trip wishes dialog, the search it starts in the visible map area,
 * and its answer, through your access points too. Entering and leaving the planner's mode for it
 * is the planner's: `onShow` is called when a search starts.
 */
export function useFindTrips(
  settings: Settings | null,
  saveSettings: (settings: Settings) => void,
  accessPoints: AccessPoints,
  onShow: () => void,
) {
  // The visible map, kept as the map reports it, so a search covers what was shown at Find trips.
  const area = useRef<Bounds>([-180, -90, 180, 90]);
  const [asking, setAsking] = useState(false);
  // The suggested trip whose details are shown, by its index in the list.
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState<TripSearch | null>(null);
  const state: SuggestedTripsState = useSuggestedTrips(search, settings ?? defaultSettings, accessPoints);

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
      setSelected(null);
      setAsking(false);
      onShow();
    },
    close: () => {
      setSearch(null);
      setSelected(null);
    },
    state,
    /** The date searched for: a used suggested trip starts on it. */
    date: search?.date ?? null,
    selected,
    /** Selects a suggested trip by its index, or goes back to the list with null. */
    select: setSelected,
    /** The map moved. */
    setArea: ({ west, south, east, north }: SearchArea) => {
      area.current = [west, south, east, north];
    },
  };
}
