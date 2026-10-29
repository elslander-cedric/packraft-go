import { describe, expect, it } from "vitest";
import {
  baseMapIds,
  defaultSettings,
  restoreSettings,
  serialiseSettings,
  withBaseMap,
  withOverlay,
  withSetting,
  withSidePanel,
} from "./settings";

describe("settings", () => {
  it("default to pace factor 1.0, paddling speed 5 km/h, OpenTopoMap, no overlays and the side panel open at 380 px", () => {
    expect(defaultSettings).toEqual({
      paceFactor: 1,
      paddleSpeedKmh: 5,
      baseMap: "opentopomap",
      overlays: [],
      sidePanelWidth: 380,
      sidePanelOpen: true,
    });
  });

  it.each(baseMapIds)("round-trip through their stored form (base map %s)", (baseMap) => {
    const settings = {
      paceFactor: 1.3,
      paddleSpeedKmh: 3.5,
      baseMap,
      overlays: ["hiking-trails"] as const,
      sidePanelWidth: 452,
      sidePanelOpen: false,
    };
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
      ...defaultSettings,
      paceFactor: 1.2,
    });
    expect(restoreSettings(JSON.stringify({ paceFactor: -1, paddleSpeedKmh: 4, baseMap: "ngi-topo" }))).toEqual({
      paceFactor: 1,
      paddleSpeedKmh: 4,
      baseMap: "ngi-topo",
      overlays: [],
      sidePanelWidth: 380,
      sidePanelOpen: true,
    });
    expect(restoreSettings(JSON.stringify({ paceFactor: 0, paddleSpeedKmh: null }))).toEqual(defaultSettings);
  });

  it.each([
    ["an unknown id", "satellite"],
    ["a number", 3],
    ["null", null],
    ["an inherited name", "toString"],
  ])("an unreadable base map (%s) falls back to OpenTopoMap, keeping the rest", (_, baseMap) => {
    expect(restoreSettings(JSON.stringify({ paceFactor: 1.2, paddleSpeedKmh: 4, baseMap }))).toEqual({
      ...defaultSettings,
      paceFactor: 1.2,
      paddleSpeedKmh: 4,
    });
  });

  it("settings stored before overlays existed restore with none switched on", () => {
    expect(restoreSettings(JSON.stringify({ paceFactor: 1.2, paddleSpeedKmh: 4, baseMap: "aerial-be" }))).toEqual({
      ...defaultSettings,
      paceFactor: 1.2,
      paddleSpeedKmh: 4,
      baseMap: "aerial-be",
    });
  });

  it("settings stored before the side panel was resizable restore with it open at 380 px", () => {
    const stored = { paceFactor: 1.2, paddleSpeedKmh: 4, baseMap: "aerial-be", overlays: ["hiking-trails"] };
    expect(restoreSettings(JSON.stringify(stored))).toEqual({ ...stored, sidePanelWidth: 380, sidePanelOpen: true });
  });

  it.each([
    ["a string", "wide", "yes"],
    ["zero and a number", 0, 1],
    ["negative and null", -300, null],
    ["not finite", null, undefined],
  ])("an unreadable side panel width or state (%s) falls back to its default, keeping the rest", (_, width, open) => {
    const stored = { paceFactor: 1.2, paddleSpeedKmh: 4, baseMap: "ngi-topo", sidePanelWidth: width, sidePanelOpen: open };
    expect(restoreSettings(JSON.stringify(stored))).toEqual({
      ...defaultSettings,
      paceFactor: 1.2,
      paddleSpeedKmh: 4,
      baseMap: "ngi-topo",
    });
  });

  it.each([
    ["not a list", "hiking-trails", []],
    ["unknown ids", ["hillshade", "hiking-trails", 3, null, "toString"], ["hiking-trails"]],
    ["a repeated id", ["hiking-trails", "hiking-trails"], ["hiking-trails"]],
  ])("restoring overlays drops what isn't a known overlay (%s)", (_, overlays, expected) => {
    expect(restoreSettings(JSON.stringify({ paceFactor: 1, paddleSpeedKmh: 5, overlays })).overlays).toEqual(expected);
  });

  describe("withSetting", () => {
    it("changes one setting to a positive number", () => {
      expect(withSetting(defaultSettings, "paceFactor", 1.5)).toEqual({ ...defaultSettings, paceFactor: 1.5 });
      expect(withSetting(defaultSettings, "paddleSpeedKmh", 3)).toEqual({ ...defaultSettings, paddleSpeedKmh: 3 });
    });

    it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])("ignores %s, keeping the settings as they were", (value) => {
      const settings = { ...defaultSettings, paceFactor: 1.2, paddleSpeedKmh: 4, baseMap: "aerial-be" } as const;
      expect(withSetting(settings, "paceFactor", value)).toBe(settings);
      expect(withSetting(settings, "paddleSpeedKmh", value)).toBe(settings);
    });
  });

  describe("withBaseMap", () => {
    it("chooses a base map, keeping the other settings", () => {
      const settings = { ...defaultSettings, paceFactor: 1.2, paddleSpeedKmh: 4 };
      expect(withBaseMap(settings, "aerial-be")).toEqual({ ...settings, baseMap: "aerial-be" });
    });

    it("keeps the settings as they were for the base map already chosen", () => {
      expect(withBaseMap(defaultSettings, "opentopomap")).toBe(defaultSettings);
    });
  });

  describe("withSidePanel", () => {
    it("changes the side panel's width or state, keeping the other settings", () => {
      const settings = { ...defaultSettings, paceFactor: 1.2, baseMap: "aerial-be" } as const;
      expect(withSidePanel(settings, { width: 450 })).toEqual({ ...settings, sidePanelWidth: 450 });
      expect(withSidePanel(settings, { open: false })).toEqual({ ...settings, sidePanelOpen: false });
    });

    it("rounds the width to whole pixels", () => {
      expect(withSidePanel(defaultSettings, { width: 412.6 }).sidePanelWidth).toBe(413);
    });

    it.each([0, -20, Number.NaN, Number.POSITIVE_INFINITY])("ignores a width of %s", (width) => {
      expect(withSidePanel(defaultSettings, { width })).toBe(defaultSettings);
    });

    it("keeps the settings as they were when nothing changes", () => {
      expect(withSidePanel(defaultSettings, { width: 380, open: true })).toBe(defaultSettings);
    });
  });

  describe("withOverlay", () => {
    it("switches an overlay on and off, keeping the other settings", () => {
      const on = withOverlay(defaultSettings, "hiking-trails", true);
      expect(on).toEqual({ ...defaultSettings, overlays: ["hiking-trails"] });
      expect(withOverlay(on, "hiking-trails", false)).toEqual(defaultSettings);
    });

    it("keeps the settings as they were when the overlay already is that way", () => {
      expect(withOverlay(defaultSettings, "hiking-trails", false)).toBe(defaultSettings);
      const on = withOverlay(defaultSettings, "hiking-trails", true);
      expect(withOverlay(on, "hiking-trails", true)).toBe(on);
    });
  });
});
