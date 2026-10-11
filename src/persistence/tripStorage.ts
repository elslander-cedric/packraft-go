// Autosave of the current trip in browser storage (spec #2, ADR 0011).
// Thin on purpose: the save format and its validation live in the core.
import { restoreTrip, serialiseTrip } from "@/core/saveFile";
import type { Trip } from "@/core/trip";

const TRIP_KEY = "packraft-go.trip";

/** The stored trip, or an empty trip when there is none, it is unreadable, or storage is blocked. */
export function loadStoredTrip(): Trip {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(TRIP_KEY);
  } catch {
    // Storage can be disabled (e.g. by privacy settings); start empty.
  }
  return restoreTrip(stored);
}

/** Saves the trip. Fails silently when storage is blocked or full: planning goes on. */
export function storeTrip(trip: Trip): void {
  try {
    window.localStorage.setItem(TRIP_KEY, serialiseTrip(trip));
  } catch {
    // Nothing to do: the trip stays in memory.
  }
}
