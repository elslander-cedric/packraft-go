import { describe, expect, it } from "vitest";
import { positionFailure, positionMessage } from "./position";
import { strings } from "../strings";

describe("positionFailure", () => {
  it("maps the Geolocation API's error codes to reasons", () => {
    expect(positionFailure(1)).toBe("denied");
    expect(positionFailure(2)).toBe("unavailable");
    expect(positionFailure(3)).toBe("timeout");
  });

  it("treats an unknown code as unavailable", () => {
    expect(positionFailure(99)).toBe("unavailable");
  });
});

describe("positionMessage", () => {
  it("says nothing before the position is asked for", () => {
    expect(positionMessage({ state: "off" })).toBeNull();
  });

  it("says it is looking while the browser locates", () => {
    expect(positionMessage({ state: "locating" })).toEqual({ kind: "status", text: strings.planner.positionLocating });
  });

  it("says nothing once the position is shown: the map shows it", () => {
    expect(positionMessage({ state: "shown", at: { lat: 50, lng: 5 }, accuracyM: 12.4 })).toBeNull();
  });

  it("explains each failure as an alert", () => {
    expect(positionMessage({ state: "failed", reason: "denied" })).toEqual({
      kind: "alert",
      text: strings.planner.positionDenied,
    });
    expect(positionMessage({ state: "failed", reason: "unavailable" })?.text).toBe(strings.planner.positionUnavailable);
    expect(positionMessage({ state: "failed", reason: "timeout" })?.text).toBe(strings.planner.positionTimeout);
    expect(positionMessage({ state: "failed", reason: "unsupported" })?.text).toBe(strings.planner.positionUnsupported);
  });
});
