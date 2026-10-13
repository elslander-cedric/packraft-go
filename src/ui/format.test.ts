import { describe, expect, it } from "vitest";
import { formatDayDate, formatDistance, formatDuration, formatElevation, formatTimeEstimate } from "./format";
import { strings } from "./strings";

// Day dates (#52): a day's calendar date, written out so it reads at a glance.
describe("formatDayDate", () => {
  it("shows the weekday, day, month and year", () => {
    expect(formatDayDate("2026-10-31")).toBe("Sat 31 Oct 2026");
    expect(formatDayDate("2027-01-01")).toBe("Fri 1 Jan 2027");
  });

  it("does not shift with the time zone", () => {
    expect(formatDayDate("2026-03-29")).toBe("Sun 29 Mar 2026");
  });
});

describe("formatTimeEstimate", () => {
  it("shows an estimated time as hours and minutes", () => {
    expect(formatTimeEstimate(1.0833, "estimated")).toBe("1 h 05 min");
  });

  it("shows a pending time as an ellipsis", () => {
    expect(formatTimeEstimate(2, "pending")).toBe(strings.timePending);
    expect(strings.timePending).toBe("…");
  });

  it("marks a time without climb data", () => {
    expect(formatTimeEstimate(0.75, "no-climb-data")).toBe("45 min (no climb data)");
  });
});

describe("formatElevation", () => {
  it("shows whole metres", () => {
    expect(formatElevation(118)).toBe("118 m");
    expect(formatElevation(78.25)).toBe("78 m");
    expect(formatElevation(0)).toBe("0 m");
  });
});

describe("formatDistance", () => {
  it("shows kilometres with one decimal", () => {
    expect(formatDistance(12.345)).toBe("12.3 km");
    expect(formatDistance(0.26)).toBe("0.3 km");
    expect(formatDistance(0)).toBe("0.0 km");
  });
});

describe("formatDuration", () => {
  it("shows hours and minutes, rounded to the minute", () => {
    expect(formatDuration(3)).toBe("3 h 00 min");
    expect(formatDuration(1.0833)).toBe("1 h 05 min");
    expect(formatDuration(12.5)).toBe("12 h 30 min");
  });

  it("shows only minutes under an hour", () => {
    expect(formatDuration(0.75)).toBe("45 min");
    expect(formatDuration(0)).toBe("0 min");
  });

  it("carries 60 rounded minutes into the hour", () => {
    expect(formatDuration(2.9999)).toBe("3 h 00 min");
    expect(formatDuration(0.9999)).toBe("1 h 00 min");
  });
});
