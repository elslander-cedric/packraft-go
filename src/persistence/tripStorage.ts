// Autosave of the current trip in browser storage (spec #2, ADR 0011).
// Thin on purpose: the save format and its validation live in the core.
import { restoreStoredTrip, serialiseTrip, type StoredTrip } from "@/core/saveFile";
import type { Trip } from "@/core/trip";

export const TRIP_KEY = "packraft-go.trip";

type TripStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): TripStorage => window.localStorage;

/**
 * The stored trip, or an empty trip when there is none, it is unreadable, or
 * storage is blocked. `unknownVersion` says the stored save is from a newer or
 * unknown version: it is left in storage, and the planner should not overwrite
 * it until the user starts a new trip or opens a file (#28).
 */
export function loadStoredTrip(storage?: TripStorage): StoredTrip {
  let stored: string | null = null;
  try {
    // Even reaching localStorage can throw when it is disabled.
    stored = (storage ?? browserStorage()).getItem(TRIP_KEY);
  } catch {
    // Storage can be disabled (e.g. by privacy settings); start empty.
  }
  return restoreStoredTrip(stored);
}

/** Saves the trip. Fails silently when storage is blocked or full: planning goes on. */
export function storeTrip(trip: Trip, storage?: TripStorage): void {
  try {
    (storage ?? browserStorage()).setItem(TRIP_KEY, serialiseTrip(trip));
  } catch {
    // Nothing to do: the trip stays in memory.
  }
}
