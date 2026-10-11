// The planner's settings in browser storage (spec #2, ADR 0011), under their
// own key. Thin on purpose: reading and validating settings live in the core.
import { restoreSettings, serialiseSettings, type Settings } from "@/core/settings";

export const SETTINGS_KEY = "packraft-go.settings";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): SettingsStorage => window.localStorage;

/** The stored settings, or the defaults when there are none, they are unreadable, or storage is blocked. */
export function loadStoredSettings(storage?: SettingsStorage): Settings {
  let stored: string | null = null;
  try {
    // Even reaching localStorage can throw when it is disabled.
    stored = (storage ?? browserStorage()).getItem(SETTINGS_KEY);
  } catch {
    // Storage can be disabled (e.g. by privacy settings); use the defaults.
  }
  return restoreSettings(stored);
}

/** Saves the settings. Fails silently when storage is blocked or full: they stay in memory. */
export function storeSettings(settings: Settings, storage?: SettingsStorage): void {
  try {
    (storage ?? browserStorage()).setItem(SETTINGS_KEY, serialiseSettings(settings));
  } catch {
    // Nothing to do.
  }
}
