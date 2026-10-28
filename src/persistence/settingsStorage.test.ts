import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/core/settings";
import { loadStoredSettings, SETTINGS_KEY, storeSettings } from "./settingsStorage";

/** An in-memory stand-in for the browser's localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

const blockedStorage = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("settings storage", () => {
  it("stores settings under their own key and loads them back", () => {
    const storage = memoryStorage();
    storeSettings({ paceFactor: 1.25, paddleSpeedKmh: 4, baseMap: "aerial-be", overlays: ["hiking-trails"] }, storage);
    expect([...storage.items.keys()]).toEqual([SETTINGS_KEY]);
    expect(loadStoredSettings(storage)).toEqual({ paceFactor: 1.25, paddleSpeedKmh: 4, baseMap: "aerial-be", overlays: ["hiking-trails"] });
  });

  it("loads the defaults when nothing is stored", () => {
    expect(loadStoredSettings(memoryStorage())).toEqual(defaultSettings);
  });

  it("loads the defaults when the stored settings are unreadable", () => {
    expect(loadStoredSettings(memoryStorage({ [SETTINGS_KEY]: "not json" }))).toEqual(defaultSettings);
  });

  it("loads the defaults and saves nothing, without throwing, when storage is blocked", () => {
    expect(loadStoredSettings(blockedStorage)).toEqual(defaultSettings);
    expect(() => storeSettings(defaultSettings, blockedStorage)).not.toThrow();
  });
});
