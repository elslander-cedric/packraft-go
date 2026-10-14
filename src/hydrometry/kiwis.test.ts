// #61: the KiWIS adapter on recorded responses (ADR 0019): it never calls the live service.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import builtIn from "@/data/walloon-stretches.json";
import { flowCheck, gaugeStations, type FlowReadings } from "@/core/flow";
import type { AgwRule } from "@/core/access";
import { CACHE_MS, HOURLY_SERIES, MEAN_72H_SERIES, createKiwisFlowSource, seriesListUrl, valuesUrl } from "./kiwis";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const LIST = fixture("timeseries-list.json");
const VALUES = fixture("timeseries-values.json");
/** The day the values were recorded (see fixtures/README.md). */
const RECORDED_ON = "2026-10-14";

type Reply = { status: number; body: string } | "network-error";

/** A stand-in KiWIS server: answers by request type and logs every request. */
function fakeServer(replies: { list?: Reply; values?: Reply } = {}) {
  const requests: URL[] = [];
  let clock = 0;
  const fetch = async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    const request = url.searchParams.get("request");
    const reply =
      request === "getTimeseriesList"
        ? (replies.list ?? { status: 200, body: LIST })
        : request === "getTimeseriesValues"
          ? (replies.values ?? { status: 200, body: VALUES })
          : { status: 400, body: "" };
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    return new Response(reply.body, { status: reply.status });
  };
  return {
    requests,
    tick: (ms: number) => (clock += ms),
    source: createKiwisFlowSource({ fetch, now: () => clock }),
  };
}

type Stretch = { gauge: { stationNo: string; name: string; assumed: boolean } | null; minM3s: number | null; maxM3s: number };
const stretches = (builtIn as unknown as { stretches: (Stretch & { id: string; category: AgwRule["category"] })[] })
  .stretches;
const rules: AgwRule[] = stretches.map((s) => ({ type: "agw", category: s.category, minM3s: s.minM3s, maxM3s: s.maxM3s, gauge: s.gauge }));
const stations = gaugeStations(rules);

describe("KiWIS requests", () => {
  it("resolves both series of every gauge in one request, and reads all their values in one more", async () => {
    const server = fakeServer();
    await server.source.readings(stations);
    expect(server.requests).toHaveLength(2);
    const [list, values] = server.requests;
    expect(list.origin + list.pathname).toBe("https://hydrometrie.wallonie.be/services/KiWIS/KiWIS");
    expect(list.searchParams.get("request")).toBe("getTimeseriesList");
    expect(list.searchParams.get("station_no")!.split(",")).toEqual(stations);
    expect(list.searchParams.get("ts_name")).toBe(`${MEAN_72H_SERIES},${HOURLY_SERIES}`);
    expect(values.searchParams.get("request")).toBe("getTimeseriesValues");
    // Every series the list named: two per gauge.
    expect(values.searchParams.get("ts_id")!.split(",")).toHaveLength(2 * stations.length);
  });

  it("builds the URLs the recorded fixtures answered", () => {
    expect(seriesListUrl(["6732"])).toContain("request=getTimeseriesList");
    expect(valuesUrl(["299146010"])).toContain("ts_id=299146010");
  });
});

describe("KiWIS answers", () => {
  it("success: readings for every gauge, and the stretches' verdicts on the recording day", async () => {
    const readings = await fakeServer().source.readings(stations);
    expect(readings.status).toBe("ok");
    if (readings.status !== "ok") return;
    expect(Object.keys(readings.gauges).sort()).toEqual(stations);
    for (const gauge of Object.values(readings.gauges)) {
      expect(gauge.mean72h.length).toBeGreaterThan(0);
      expect(gauge.hourly.length).toBeGreaterThan(0);
      // Belgian local time with its offset, so dates and hours are read from the text.
      expect(gauge.hourly[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/);
    }
    // At 08:58 on the recording day (a dry October): what the stretches' gauges said.
    const verdict = (id: string) => {
      const s = stretches.find((x) => x.id === id)!;
      return flowCheck(rules[stretches.indexOf(s)]!, readings, RECORDED_ON);
    };
    // Amblève at Stavelot: 72-hour mean 4.444 above the minimum of 1, 08:00 flow 4.429 below 21.
    expect(verdict("1B1a")).toMatchObject({ kind: "ok", figures: { mean72h: { m3s: 4.444 }, at8: { m3s: 4.429 } } });
    // Semois at Membre: 72-hour mean 1.407 below the minimum of 2.2.
    expect(verdict("1B4c")).toMatchObject({ kind: "low", figures: { mean72h: { m3s: 1.407 } } });
    // Sûre at Martelange (an AQUALIM gauge): its 08:00 flow wasn't published yet, latest 07:00.
    expect(verdict("1C4a")).toMatchObject({
      kind: "unknown",
      why: "not-measured-yet",
      figures: { latest: { at: "2026-10-14T07:00:00.000+02:00" } },
    });
  });

  it("stale data: the same answer a day later is unknown", async () => {
    const readings = await fakeServer().source.readings(stations);
    const stretch = rules.find((r) => r.gauge)!;
    expect(flowCheck(stretch, readings, "2026-10-15")).toMatchObject({ kind: "unknown", why: "stale" });
  });

  it("missing series: a gauge the service has no series for is absent, and its stretch unknown", async () => {
    const readings = await fakeServer().source.readings([...stations, "L0000"]);
    expect(readings.status === "ok" && readings.gauges["L0000"]).toBeFalsy();
    const rule: AgwRule = { type: "agw", category: "1.C", minM3s: null, maxM3s: 5, gauge: { name: "Nowhere", stationNo: "L0000", assumed: false } };
    expect(flowCheck(rule, readings, RECORDED_ON)).toMatchObject({ kind: "unknown", why: "missing" });
  });

  it("an empty series list asks for no values", async () => {
    const server = fakeServer({ list: { status: 200, body: '[["station_no","ts_id","ts_name"]]' } });
    expect(await server.source.readings(["L0000"])).toEqual({ status: "ok", gauges: {} });
    expect(server.requests).toHaveLength(1);
  });

  const failures: [string, { list?: Reply; values?: Reply }][] = [
    ["the network fails", { list: "network-error" }],
    ["the series list answers 503", { list: { status: 503, body: "" } }],
    ["the values answer 500", { values: { status: 500, body: "" } }],
    ["the answer isn't JSON", { values: { status: 200, body: "<html>maintenance</html>" } }],
    ["the answer is an error object, not a table", { list: { status: 200, body: '{"type":"error","message":"x"}' } }],
  ];
  it.each(failures)("failure when %s", async (_, replies) => {
    const readings: FlowReadings = await fakeServer(replies).source.readings(stations);
    expect(readings).toEqual({ status: "failed" });
  });
});

describe("caching", () => {
  it("reuses the answer for 15 minutes, then asks again", async () => {
    const server = fakeServer();
    await server.source.readings(stations);
    server.tick(CACHE_MS - 1);
    await server.source.readings([...stations].reverse());
    expect(server.requests).toHaveLength(2);
    server.tick(1);
    await server.source.readings(stations);
    expect(server.requests).toHaveLength(4);
    expect(CACHE_MS).toBe(15 * 60 * 1000);
  });

  it("callers at the same time share one refresh: at most 2 requests", async () => {
    const server = fakeServer();
    await Promise.all([server.source.readings(stations), server.source.readings(stations)]);
    expect(server.requests).toHaveLength(2);
  });

  it("a failure is cached too, so a failing service isn't asked again and again", async () => {
    const server = fakeServer({ list: { status: 503, body: "" } });
    await server.source.readings(stations);
    await server.source.readings(stations);
    expect(server.requests).toHaveLength(1);
  });

  it("asks nothing when there are no gauges", async () => {
    const server = fakeServer();
    expect(await server.source.readings([])).toEqual({ status: "ok", gauges: {} });
    expect(server.requests).toHaveLength(0);
  });
});
