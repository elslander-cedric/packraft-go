import { useSyncExternalStore } from "react";
import {
  defaultSettings,
  withBaseMap,
  withOverlay,
  withSidePanel,
  type BaseMapId,
  type OverlayId,
  type Settings,
} from "@/core/settings";
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

/**
 * The chosen base map (ADR 0031) and a way to choose another. The default until the settings are read in the browser.
 */
export function useBaseMap(): [BaseMapId, (id: BaseMapId) => void] {
  const [settings, saveSettings] = useSettings();
  return [
    settings?.baseMap ?? defaultSettings.baseMap,
    (id) => {
      if (settings) saveSettings(withBaseMap(settings, id));
    },
  ];
}

/**
 * The switched-on overlays (ADR 0032) and a way to switch one on or off. None until the settings are read in the browser.
 */
export function useOverlays(): [readonly OverlayId[], (id: OverlayId, on: boolean) => void] {
  const [settings, saveSettings] = useSettings();
  return [
    settings?.overlays ?? defaultSettings.overlays,
    (id, on) => {
      if (settings) saveSettings(withOverlay(settings, id, on));
    },
  ];
}

/**
 * The side panel's chosen width and whether it is open (ADR 0034), and a way to change either.
 * Settings on this device; the defaults until the settings are read in the browser.
 */
export function useSidePanel(): [{ width: number; open: boolean }, (change: { width?: number; open?: boolean }) => void] {
  const [settings, saveSettings] = useSettings();
  const { sidePanelWidth: width, sidePanelOpen: open } = settings ?? defaultSettings;
  return [
    { width, open },
    (change) => {
      if (!settings) return;
      const changed = withSidePanel(settings, change);
      if (changed !== settings) saveSettings(changed);
    },
  ];
}
