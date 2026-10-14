// The live KiWIS check's comparison logic, tested offline against the recorded
// fixtures. No test here calls the network (ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seriesListUrl, valuesUrl } from "./kiwis";
import {
  brusselsOffsetMinutes,
  compareWithFixture,
  isBrusselsLocalTimestamp,
  KIWIS_CHECK_DELAY_MS,
  KIWIS_CHECK_USER_AGENT,
  runKiwisCheck,
  type KiwisAnswers,
} from "./liveCheck";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const recorded: KiwisAnswers = {
  list: { status: 200, body: fixture("timeseries-list.json") },
  values: { status: 200, body: fixture("timeseries-values.json") },
};

type Entry = { ts_id: string; columns: string; data: [string, number | null][] };
const editedValues = (edit: (entries: Entry[]) => void): KiwisAnswers => {
  const entries = JSON.parse(recorded.values.body) as Entry[];
  edit(entries);
  return { ...recorded, values: { status: 200, body: JSON.stringify(entries) } };
};
const editedList = (edit: (rows: string[][]) => string[][]): KiwisAnswers => ({
  ...recorded,
  list: { status: 200, body: JSON.stringify(edit(JSON.parse(recorded.list.body))) },
});
const levels = async (live: KiwisAnswers) => (await compareWithFixture(live, recorded)).map((f) => f.level);
const mismatches = async (live: KiwisAnswers) =>
  (await compareWithFixture(live, recorded)).filter((f) => f.level === "mismatch").map((f) => f.message);

describe("KiWIS contract check: the recorded answers", () => {
  it("match themselves with no drift and no mismatch", async () => {
    expect(new Set(await levels(recorded))).toEqual(new Set(["match"]));
  });

  it("stay a match when only values and ts_ids change (drift at most)", async () => {
    const live = editedValues((entries) => {
      for (const e of entries) e.data = e.data.map(([at, v]) => [at, v === null ? v : v * 1.5]);
    });
    expect(await mismatches(live)).toEqual([]);
  });
});

describe("KiWIS contract check: time offset", () => {
  it("knows Brussels local time: +02:00 in summer, +01:00 in winter", () => {
    expect(brusselsOffsetMinutes(new Date("2026-10-14T06:00:00Z"))).toBe(120);
    expect(brusselsOffsetMinutes(new Date("2026-12-01T06:00:00Z"))).toBe(60);
    expect(isBrusselsLocalTimestamp("2026-10-14T08:00:00.000+02:00")).toBe(true);
    expect(isBrusselsLocalTimestamp("2026-12-01T08:00:00.000+01:00")).toBe(true);
    // The night the clocks go back (25 October 2026, 03:00 CEST -> 02:00 CET).
    expect(isBrusselsLocalTimestamp("2026-10-25T02:30:00.000+02:00")).toBe(true);
    expect(isBrusselsLocalTimestamp("2026-10-25T02:30:00.000+01:00")).toBe(true);
  });

  it("rejects UTC and a wrong season's offset", () => {
    expect(isBrusselsLocalTimestamp("2026-10-14T06:00:00.000Z")).toBe(false);
    expect(isBrusselsLocalTimestamp("2026-10-14T06:00:00.000+00:00")).toBe(false);
    expect(isBrusselsLocalTimestamp("2026-10-14T08:00:00.000+01:00")).toBe(false);
    expect(isBrusselsLocalTimestamp("2026-10-14T08:00:00.000")).toBe(false);
    expect(isBrusselsLocalTimestamp("not a date")).toBe(false);
  });

  it("reports MISMATCH when KiWIS starts answering in UTC", async () => {
    const live = editedValues((entries) => {
      for (const e of entries) {
        // Same instants, written in UTC: 08:00 CEST becomes 06:00Z.
        e.data = e.data.map(([at, v]) => [new Date(at).toISOString(), v]);
      }
    });
    const found = await mismatches(live);
    expect(found.some((m) => m.includes("not Brussels local time"))).toBe(true);
  });

  it("reports MISMATCH when the offset is +00:00", async () => {
    const live = editedValues((entries) => {
      for (const e of entries) e.data = e.data.map(([at, v]) => [at.replace(/[+-]\d\d:\d\d$/, "+00:00"), v]);
    });
    expect((await mismatches(live)).some((m) => m.includes("not Brussels local time"))).toBe(true);
  });
});

describe("KiWIS contract check: shape changes", () => {
  it("reports MISMATCH when the series list is no table", async () => {
    const live = { ...recorded, list: { status: 200, body: JSON.stringify({ error: "x" }) } };
    expect(await mismatches(live)).toContain("series list is not a table (array of rows)");
  });

  it("reports MISMATCH when a column is renamed", async () => {
    const live = editedList((rows) => [["station", ...rows[0].slice(1)], ...rows.slice(1)]);
    expect((await mismatches(live))[0]).toContain("header lacks station_no");
  });

  it("reports MISMATCH when the hourly series is gone", async () => {
    const live = editedList((rows) => rows.filter((r, i) => i === 0 || r[2] !== "10-Debit.1h.Moyen"));
    expect((await mismatches(live)).some((m) => m.includes('no "10-Debit.1h.Moyen" series'))).toBe(true);
  });

  it("reports MISMATCH when the value columns change", async () => {
    const live = editedValues((entries) => {
      entries[0].columns = "Value,Timestamp";
    });
    expect((await mismatches(live)).some((m) => m.includes("values columns"))).toBe(true);
  });

  it("reports MISMATCH when hourly readings are no longer on the hour", async () => {
    const live = editedValues((entries) => {
      for (const e of entries) e.data = e.data.map(([at, v]) => [at.replace(":00:00.000", ":30:00.000"), v]);
    });
    expect((await mismatches(live)).some((m) => m.includes("not on the hour"))).toBe(true);
  });

  it("reports MISMATCH on an HTTP error or a body that isn't JSON", async () => {
    expect(await mismatches({ ...recorded, list: { status: 503, body: "" } })).toContain(
      "series list: HTTP status 503, fixture has 200",
    );
    expect(await mismatches({ ...recorded, values: { status: 200, body: "<html>" } })).toContain("values answer is not JSON");
  });

  it("reports drift (not mismatch) when 72-hour means are stamped at another hour", async () => {
    const live = editedValues((entries) => {
      for (const e of entries) e.data = e.data.map(([at, v]) => [at.replace("T01:00:00", "T02:00:00"), v]);
    });
    const found = await compareWithFixture(live, recorded);
    expect(found.some((f) => f.level === "drift" && f.message.includes("01:00"))).toBe(true);
    expect(found.some((f) => f.level === "mismatch")).toBe(false);
  });
});

describe("runKiwisCheck", () => {
  const stations = [...new Set((JSON.parse(recorded.list.body) as string[][]).slice(1).map((r) => r[0]))];

  function run(replies: { list?: Response; values?: Response } = {}) {
    const requests: { url: string; headers: Record<string, string> }[] = [];
    const waits: number[] = [];
    const result = runKiwisCheck({
      fetch: async (url, init) => {
        requests.push({ url, headers: init.headers });
        const isList = new URL(url).searchParams.get("request") === "getTimeseriesList";
        return (isList ? replies.list : replies.values) ?? new Response(isList ? recorded.list.body : recorded.values.body);
      },
      wait: async (ms) => {
        waits.push(ms);
      },
      readFixture: fixture,
    });
    return { requests, waits, result };
  }

  it("makes the app's two requests one at a time, with a pause, identifying itself with the project URL only", async () => {
    const { requests, waits, result } = run();
    const outcome = await result;
    expect(outcome.passed).toBe(true);
    expect(outcome.report).toContain("PASSED: the live service still matches");
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(seriesListUrl(stations));
    const ids = (JSON.parse(recorded.list.body) as string[][]).slice(1).map((r) => r[1]);
    expect(requests[1].url).toBe(valuesUrl(ids));
    expect(waits).toEqual([KIWIS_CHECK_DELAY_MS]);
    for (const r of requests) expect(r.headers).toEqual({ "User-Agent": KIWIS_CHECK_USER_AGENT });
    expect(KIWIS_CHECK_USER_AGENT).toContain("https://github.com/elslander-cedric/packraft-go");
    expect(KIWIS_CHECK_USER_AGENT).not.toContain("@");
  });

  it("fails, without a retry, when the list request errors", async () => {
    const { requests, result } = run({ list: new Response("", { status: 500 }) });
    const outcome = await result;
    expect(outcome.passed).toBe(false);
    expect(requests).toHaveLength(1);
    expect(outcome.report).toContain("FAILED");
  });

  it("fails when the values come back in UTC", async () => {
    const entries = JSON.parse(recorded.values.body) as Entry[];
    for (const e of entries) e.data = e.data.map(([at, v]) => [new Date(at).toISOString(), v]);
    const outcome = await run({ values: new Response(JSON.stringify(entries)) }).result;
    expect(outcome.passed).toBe(false);
    expect(outcome.report).toContain("MISMATCH");
    expect(outcome.report).toContain("not Brussels local time");
  });

  it("reports a network failure as a mismatch", async () => {
    const outcome = await runKiwisCheck({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      wait: async () => {},
      readFixture: fixture,
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.report).toContain("request failed: fetch failed");
  });
});
