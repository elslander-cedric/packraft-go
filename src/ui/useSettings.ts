import { useSyncExternalStore } from "react";
import type { Settings } from "@/core/settings";
import { loadStoredSettings, storeSettings } from "@/persistence/settingsStorage";

// Browser storage is an external store: read it once, then keep the current
// settings here and tell subscribers when they change.
let current: Settings | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => (current ??= loadStoredSettings());
// On the server (and while hydrating) there is no browser storage yet.
const getServerSnapshot = () => null;

function changeSettings(settings: Settings) {
  current = settings;
  storeSettings(settings);
  for (const listener of listeners) listener();
}

/**
 * The planner's settings, remembered in browser storage, and a way to change
 * them. `null` until they are read in the browser.
 */
export function useSettings(): [Settings | null, (settings: Settings) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), changeSettings];
}
