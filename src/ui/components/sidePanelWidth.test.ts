import { describe, expect, it } from "vitest";
import { sidePanelCover, sidePanelWidthLimits, sidePanelWidthWithin } from "./sidePanelWidth";

describe("side panel width", () => {
  it("lies between 320 px and half the window", () => {
    expect(sidePanelWidthLimits(1280)).toEqual({ min: 320, max: 640 });
    expect(sidePanelWidthLimits(915)).toEqual({ min: 320, max: 457 });
  });

  it("on a window under 640 px wide is at most half of it, so the map keeps the other half", () => {
    expect(sidePanelWidthLimits(568)).toEqual({ min: 284, max: 284 });
  });

  it.each([
    ["kept within the limits", 400, 400],
    ["too narrow, the minimum", 200, 320],
    ["too wide, the maximum", 900, 640],
    ["a fraction, rounded", 400.4, 400],
  ])("a width %s", (_, width, expected) => {
    expect(sidePanelWidthWithin(width, 1280)).toBe(expected);
  });

  it("open, covers the share of the window its width takes, within the limits", () => {
    expect(sidePanelCover(400, 1000)).toBe(0.4);
    expect(sidePanelCover(900, 1000)).toBe(0.5);
    expect(sidePanelCover(100, 1000)).toBe(0.32);
  });
});
