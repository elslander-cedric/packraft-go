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
    expect(positionMessage({ state: "locating" })).toEqual({ kind: "status", text: strings.phone.positionLocating });
  });

  it("gives the accuracy of a shown position, rounded to whole metres", () => {
    expect(positionMessage({ state: "shown", at: { lat: 50, lng: 5 }, accuracyM: 12.4 })).toEqual({
      kind: "status",
      text: strings.phone.positionAccuracy("12 m"),
    });
  });

  it("explains each failure as an alert", () => {
    expect(positionMessage({ state: "failed", reason: "denied" })).toEqual({
      kind: "alert",
      text: strings.phone.positionDenied,
    });
    expect(positionMessage({ state: "failed", reason: "unavailable" })?.text).toBe(strings.phone.positionUnavailable);
    expect(positionMessage({ state: "failed", reason: "timeout" })?.text).toBe(strings.phone.positionTimeout);
    expect(positionMessage({ state: "failed", reason: "unsupported" })?.text).toBe(strings.phone.positionUnsupported);
  });
});
