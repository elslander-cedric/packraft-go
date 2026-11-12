// The live KiWIS check: DST boundaries, wrong-season offsets, and no live network in tests.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareWithFixture, isBrusselsLocalTimestamp, runKiwisCheck, type KiwisAnswers } from "./liveCheck";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const recorded: KiwisAnswers = {
  list: { status: 200, body: fixture("timeseries-list.json") },
  values: { status: 200, body: fixture("timeseries-values.json") },
};

afterEach(() => vi.unstubAllGlobals());

describe("time offset", () => {
  it("handles the DST switches of 2026 (29 March, 25 October)", () => {
    expect(isBrusselsLocalTimestamp("2026-03-29T01:59:59+01:00")).toBe(true);
    expect(isBrusselsLocalTimestamp("2026-03-29T03:00:00+02:00")).toBe(true);
    expect(isBrusselsLocalTimestamp("2026-03-29T03:00:00+01:00")).toBe(false);
    expect(isBrusselsLocalTimestamp("2026-10-25T02:30:00+02:00")).toBe(true);
    expect(isBrusselsLocalTimestamp("2026-10-25T02:30:00+01:00")).toBe(true);
    expect(isBrusselsLocalTimestamp("2026-10-25T03:00:00+02:00")).toBe(false);
  });
  it("rejects no offset, Z, +00:00, wrong season, other zones", () => {
    for (const timestamp of [
      "2026-07-01T08:00:00",
      "2026-07-01T08:00:00Z",
      "2026-07-01T08:00:00+00:00",
      "2026-07-01T08:00:00+01:00",
      "2026-01-15T08:00:00+02:00",
      "2026-01-15T08:00:00+05:30",
      "garbage",
    ]) {
      expect(isBrusselsLocalTimestamp(timestamp), timestamp).toBe(false);
    }
    expect(isBrusselsLocalTimestamp("2026-07-01T08:00:00.000+02:00")).toBe(true);
  });
  it("flags a single wrong offset as MISMATCH", async () => {
    const entries = JSON.parse(recorded.values.body);
    const first = entries[0].data[0];
    first[0] = first[0].replace(/[+-]\d\d:\d\d$/, "+00:00");
    const findings = await compareWithFixture(
      { ...recorded, values: { status: 200, body: JSON.stringify(entries) } },
      recorded,
    );
    expect(findings.some((x) => x.level === "mismatch" && /not Brussels/.test(x.message))).toBe(true);
  });
});

describe("no live services", () => {
  it("the comparison never touches global fetch", async () => {
    const spy = vi.fn(() => {
      throw new Error("network!");
    });
    vi.stubGlobal("fetch", spy);
    const findings = await compareWithFixture(recorded, recorded);
    expect(findings.filter((x) => x.level !== "match")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
  it("runKiwisCheck uses only the injected fetch, 2 requests", async () => {
    const spy = vi.fn(() => {
      throw new Error("network!");
    });
    vi.stubGlobal("fetch", spy);
    let number = 0;
    await runKiwisCheck({
      fetch: async (url) => {
        number++;
        return new Response(url.includes("getTimeseriesList") ? recorded.list.body : recorded.values.body);
      },
      wait: async () => {},
      readFixture: fixture,
    });
    expect(number).toBe(2);
    expect(spy).not.toHaveBeenCalled();
  });
});
