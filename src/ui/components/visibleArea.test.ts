import { describe, expect, it } from "vitest";
import { visibleAreaStyle } from "./visibleArea";

describe("visibleAreaStyle (#163)", () => {
  it("gives the visible area's top and height for Dialog.css", () => {
    expect(visibleAreaStyle({ top: 0, height: 380 })).toEqual({
      "--visible-top": "0px",
      "--visible-height": "380px",
    });
  });

  it("keeps the offset when the browser has panned the layout", () => {
    expect(visibleAreaStyle({ top: 212.4, height: 401.6 })).toEqual({
      "--visible-top": "212px",
      "--visible-height": "402px",
    });
  });

  it("falls back to the full screen without an area", () => {
    expect(visibleAreaStyle(null)).toEqual({});
    expect(visibleAreaStyle({ top: 0, height: 0 })).toEqual({});
    expect(visibleAreaStyle({ top: 0, height: Number.NaN })).toEqual({});
  });
});
