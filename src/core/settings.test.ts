import { describe, expect, it } from "vitest";
import { defaultSettings, restoreSettings, serialiseSettings, withSetting } from "./settings";

describe("settings", () => {
  it("default to pace factor 1.0 and paddling speed 5 km/h", () => {
    expect(defaultSettings).toEqual({ paceFactor: 1, paddleSpeedKmh: 5 });
  });

  it("round-trip through their stored form", () => {
    const settings = { paceFactor: 1.3, paddleSpeedKmh: 3.5 };
    expect(restoreSettings(serialiseSettings(settings))).toEqual(settings);
  });

  it("nothing stored gives the defaults", () => {
    expect(restoreSettings(null)).toEqual(defaultSettings);
  });

  it.each([
    ["not JSON", "{oops"],
    ["JSON null", "null"],
    ["a number", "42"],
    ["an array", "[1, 5]"],
    ["an empty object", "{}"],
  ])("unreadable stored settings (%s) give the defaults", (_, stored) => {
    expect(restoreSettings(stored)).toEqual(defaultSettings);
  });

  it("keeps a readable setting and falls back to the default for an unreadable one", () => {
    expect(restoreSettings(JSON.stringify({ paceFactor: 1.2, paddleSpeedKmh: "fast" }))).toEqual({
      paceFactor: 1.2,
      paddleSpeedKmh: 5,
    });
    expect(restoreSettings(JSON.stringify({ paceFactor: -1, paddleSpeedKmh: 4 }))).toEqual({
      paceFactor: 1,
      paddleSpeedKmh: 4,
    });
    expect(restoreSettings(JSON.stringify({ paceFactor: 0, paddleSpeedKmh: null }))).toEqual(defaultSettings);
  });

  describe("withSetting", () => {
    it("changes one setting to a positive number", () => {
      expect(withSetting(defaultSettings, "paceFactor", 1.5)).toEqual({ paceFactor: 1.5, paddleSpeedKmh: 5 });
      expect(withSetting(defaultSettings, "paddleSpeedKmh", 3)).toEqual({ paceFactor: 1, paddleSpeedKmh: 3 });
    });

    it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])("ignores %s, keeping the settings as they were", (value) => {
      const settings = { paceFactor: 1.2, paddleSpeedKmh: 4 };
      expect(withSetting(settings, "paceFactor", value)).toBe(settings);
      expect(withSetting(settings, "paddleSpeedKmh", value)).toBe(settings);
    });
  });
});
