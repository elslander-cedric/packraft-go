import { describe, expect, it } from "vitest";
import { formatDistance } from "./format";

describe("formatDistance", () => {
  it("shows kilometres with one decimal", () => {
    expect(formatDistance(12.345)).toBe("12.3 km");
    expect(formatDistance(0.26)).toBe("0.3 km");
    expect(formatDistance(0)).toBe("0.0 km");
  });
});
