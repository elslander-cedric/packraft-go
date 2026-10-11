import { describe, expect, it } from "vitest";
import { formatDistance, formatElevation } from "./format";

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
