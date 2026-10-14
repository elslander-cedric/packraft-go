import { describe, expect, it } from "vitest";
import {
  formatDayDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatFlow,
  formatReadingTime,
  formatTimeEstimate,
} from "./format";
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

describe("formatFlow (#61)", () => {
  it("shows a flow in m³/s with at most two decimals", () => {
    expect(formatFlow(5.038)).toBe("5.04 m³/s");
    expect(formatFlow(44)).toBe("44 m³/s");
    expect(formatFlow(0.5)).toBe("0.5 m³/s");
  });
});

describe("formatReadingTime (#61)", () => {
  it("shows a reading's Belgian local date and time as the service gave it, never shifted", () => {
    expect(formatReadingTime("2026-10-14T08:00:00.000+02:00")).toBe("Wed 14 Oct 2026, 08:00");
    expect(formatReadingTime("2026-12-31T23:00:00.000+01:00")).toBe("Thu 31 Dec 2026, 23:00");
  });
});
