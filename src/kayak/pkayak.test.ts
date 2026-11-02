// #210: the PKAYAK adapter on a recorded answer (ADR 0019): it never calls the live service.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import builtIn from "@/data/walloon-stretches.json";
import { CACHE_MS, PKAYAK_URL, REQUEST_TIMEOUT_MS, createPkayakStatusSource, incidentsUrl, stretchesUrl } from "./pkayak";

const RECORDED = readFileSync(path.join(__dirname, "fixtures", "layer5-stretches.json"), "utf8");
const RECORDED_INCIDENTS = readFileSync(path.join(__dirname, "fixtures", "layer0-incidents.json"), "utf8");

/** `hangs` never answers; `hangs-in-body` sends its headers and then nothing. */
type Reply = { status: number; body: string } | "network-error" | "hangs" | "hangs-in-body";

/** A stand-in PKAYAK server: logs every request, and keeps the clock and its timers. */
function fakeServer(
  firstReply: Reply = { status: 200, body: RECORDED },
  firstIncidentsReply: Reply = { status: 200, body: RECORDED_INCIDENTS },
) {
  const requests: URL[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  let reply = firstReply;
  let incidentsReply = firstIncidentsReply;
  let clock = 0;
  let timers: { at: number; fire: () => void }[] = [];
  const fetch = async (input: string, init?: { signal?: AbortSignal }) => {
    const url = new URL(input);
    requests.push(url);
    signals.push(init?.signal);
    const answer = url.pathname.endsWith("/0/query") ? incidentsReply : reply;
    if (answer === "network-error") throw new TypeError("Failed to fetch");
    if (answer === "hangs") return new Promise<Response>(() => {});
    if (answer === "hangs-in-body") return new Response(new ReadableStream());
    return new Response(answer.body, { status: answer.status });
  };
  return {
    requests,
    signals,
    answerWith: (next: Reply) => (reply = next),
    answerIncidentsWith: (next: Reply) => (incidentsReply = next),
    source: () =>
      createPkayakStatusSource({
        fetch,
        now: () => clock,
        setTimer: (fire, ms) => {
          const timer = { at: clock + ms, fire };
          timers.push(timer);
          return () => (timers = timers.filter((t) => t !== timer));
        },
      }),
    advance(ms: number) {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock);
      timers = timers.filter((t) => t.at > clock);
      for (const timer of due) timer.fire();
    },
  };
}

const answer = (features: readonly object[]) => ({
  status: 200,
  body: JSON.stringify({ features: features.map((attributes) => ({ attributes })) }),
});

const FAILED = { status: "failed" };
const POINT = { x: 5.5, y: 50.1 };
const incidentsAnswer = (...features: { attributes: object; geometry?: object }[]) => ({
  status: 200,
  body: JSON.stringify({ features }),
});

describe("the request", () => {
  it("asks layer 5 for only the fields it needs, without geometry", () => {
    const url = new URL(stretchesUrl());
    expect(`${url.origin}${url.pathname}`).toBe(`${PKAYAK_URL}/5/query`);
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("outFields")).toBe("nomtro,stapub,justie,justif");
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("where")).toBe("1=1");
  });

  it("asks layer 0 for only the fields it needs, with its position in WGS84", () => {
    const url = new URL(incidentsUrl());
    expect(`${url.origin}${url.pathname}`).toBe(`${PKAYAK_URL}/0/query`);
    expect(url.searchParams.get("outFields")).toBe("id,nomtro,commen,commene,datcre,datmod,datexp");
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("where")).toBe("1=1");
  });

  it("uses the map service, not the REST API at kayak.spw.wallonie.be", () => {
    expect(new URL(stretchesUrl()).hostname).toBe("geoservices3.wallonie.be");
    expect(new URL(incidentsUrl()).hostname).toBe("geoservices3.wallonie.be");
  });
});

describe("reading the recorded answer", () => {
  it("gives a reading per official stretch, with its code", async () => {
    const readings = await fakeServer().source().readings();
    if (readings.status !== "ok") throw new Error("expected readings");
    expect(Object.keys(readings.stretches)).toHaveLength(21);
    expect(readings.stretches["SEMOIS4-5"].code).toBe("1");
    expect(readings.stretches["AMBLEVE3"].code).toBe("0");
  });

  it("keeps the SPW's French reason, and no reason where it gives none or an empty one", async () => {
    const readings = await fakeServer().source().readings();
    if (readings.status !== "ok") throw new Error("expected readings");
    expect(readings.stretches["AMBLEVE3"]).toEqual({
      code: "0",
      reasonFr: "Rivière non sécurisée suite aux inondations",
    });
    expect(readings.stretches["SEMOIS2-3"]).toEqual({ code: "0" });
    expect(readings.stretches["SEMOIS4-5"]).toEqual({ code: "1" });
  });

  it("knows every official stretch the app's data names", async () => {
    const readings = await fakeServer().source().readings();
    if (readings.status !== "ok") throw new Error("expected readings");
    const stretches = builtIn.stretches.flatMap((s) => ("officialStretch" in s ? [s.officialStretch as string] : []));
    expect(stretches.length).toBeGreaterThan(0);
    for (const id of stretches) expect(readings.stretches).toHaveProperty([id]);
  });
});

describe("parsing", () => {
  const readingsOf = (reply: Reply) => fakeServer(reply).source().readings();

  it("keeps the English reason beside the French", async () => {
    const readings = await readingsOf(answer([{ nomtro: "A", stapub: "0", justie: " Too low ", justif: "Trop bas" }]));
    expect(readings).toEqual({ status: "ok", stretches: { A: { code: "0", reasonEn: "Too low", reasonFr: "Trop bas" } } });
  });

  it("keeps a code as the SPW gives it, for the core to judge", async () => {
    const readings = await readingsOf(answer([{ nomtro: "A", stapub: "7" }, { nomtro: "B", stapub: 1 }, { nomtro: "C", stapub: null }]));
    expect(readings).toEqual({
      status: "ok",
      stretches: { A: { code: "7" }, B: { code: "1" }, C: { code: "" } },
    });
  });

  it("skips a feature with no stretch id", async () => {
    expect(await readingsOf(answer([{ stapub: "1" }, {}]))).toEqual({ status: "ok", stretches: {} });
  });

  it.each<[string, Reply]>([
    ["a network error", "network-error"],
    ["a 503", { status: 503, body: "" }],
    ["a body that isn't JSON", { status: 200, body: "<html>" }],
    ["an ArcGIS error in a 200", { status: 200, body: '{"error":{"code":400,"message":"Invalid"}}' }],
    ["a body with no features", { status: 200, body: "{}" }],
    ["a null body", { status: 200, body: "null" }],
  ])("%s is a failure, never a throw", async (_, reply) => {
    expect(await readingsOf(reply)).toEqual({ status: "failed" });
  });
});

describe("the timeout", () => {
  it.each<Reply>(["hangs", "hangs-in-body"])("a request that %s fails after the timeout, and is aborted", async (reply) => {
    const server = fakeServer(reply);
    const answered = server.source().readings();
    server.advance(REQUEST_TIMEOUT_MS);
    expect(await answered).toEqual({ status: "failed" });
    expect(server.signals[0]?.aborted).toBe(true);
  });

  it("an answer in time isn't cut off later", async () => {
    const server = fakeServer();
    const readings = await server.source().readings();
    server.advance(REQUEST_TIMEOUT_MS);
    expect(readings.status).toBe("ok");
    expect(server.signals[0]?.aborted).toBe(false);
  });
});

describe("the 15-minute cache", () => {
  it("makes a refresh at most two requests, one per layer, for callers at the same time", async () => {
    const server = fakeServer();
    const source = server.source();
    await Promise.all([source.readings(), source.readings(), source.incidents()]);
    expect(server.requests.map((url) => url.pathname.split("/").at(-2))).toEqual(["5", "0"]);
  });

  it("reuses an answer for 15 minutes, then asks again", async () => {
    const server = fakeServer();
    const source = server.source();
    await source.readings();
    server.advance(CACHE_MS - 1);
    await Promise.all([source.readings(), source.incidents()]);
    expect(server.requests).toHaveLength(2);
    server.advance(1);
    await Promise.all([source.readings(), source.incidents()]);
    expect(server.requests).toHaveLength(4);
  });

  it("caches a failure too, a timeout included, then recovers", async () => {
    const server = fakeServer("hangs");
    const source = server.source();
    const first = source.readings();
    server.advance(REQUEST_TIMEOUT_MS);
    await first;
    expect((await source.readings()).status).toBe("failed");
    expect(server.requests).toHaveLength(2);
    server.answerWith({ status: 200, body: RECORDED });
    server.advance(CACHE_MS);
    expect((await source.readings()).status).toBe("ok");
    expect(server.requests).toHaveLength(4);
  });

  it("caches a failure of the incidents too, then recovers", async () => {
    const server = fakeServer(undefined, { status: 503, body: "" });
    const source = server.source();
    expect(await source.incidents()).toEqual(FAILED);
    expect(await source.incidents()).toEqual(FAILED);
    expect(server.requests).toHaveLength(2);
    server.answerIncidentsWith({ status: 200, body: RECORDED_INCIDENTS });
    server.advance(CACHE_MS);
    expect((await source.incidents()).status).toBe("ok");
    expect(server.requests).toHaveLength(4);
  });
});

describe("the incidents", () => {
  const recorded = async () => {
    const incidents = await fakeServer().source().incidents();
    if (incidents.status !== "ok") throw new Error("expected incidents");
    return incidents.incidents;
  };
  const incidentsOf = (reply: Reply) => fakeServer(undefined, reply).source().incidents();

  it("gives each recorded incident with its id, stretch, position, texts and dates", async () => {
    const incidents = await recorded();
    expect(incidents.map((incident) => incident.spwId)).toEqual([1, 2002, 2003]);
    expect(incidents[0]).toEqual({
      id: "incident-1",
      spwId: 1,
      officialStretch: "LESSE6-7",
      position: [4.902188848027567, 50.23480097632967],
      textEn: "Water discharge from a power station, do not tighten the bank to avoid capsizing",
      textFr: "Rejet d'eau d'une centrale électrique, ne pas serrer la berge droite pour éviter de chavirer",
      created: "2018-04-30",
      changed: "2021-04-16",
    });
  });

  it("leaves out a changed date the SPW doesn't give", async () => {
    expect((await recorded())[1]).not.toHaveProperty("changed");
  });

  it("reads a date as the day in Brussels, so a late evening stays on its day", async () => {
    const lateOnNewYearsEve = Date.UTC(2026, 11, 31, 23, 30); // 00:30 on 1 January in Brussels.
    const answered = await incidentsOf(
      incidentsAnswer({ attributes: { id: 7, datcre: lateOnNewYearsEve, datexp: lateOnNewYearsEve }, geometry: POINT }),
    );
    expect(answered).toEqual({
      status: "ok",
      incidents: [{ id: "incident-7", spwId: 7, position: [5.5, 50.1], created: "2027-01-01", expires: "2027-01-01" }],
    });
  });

  it("keeps an incident with only French text, and blank text counts as none", async () => {
    const answered = await incidentsOf(
      incidentsAnswer({ attributes: { id: 7, commen: "Travaux", commene: "  " }, geometry: POINT }),
    );
    if (answered.status !== "ok") throw new Error("expected incidents");
    expect(answered.incidents[0].textFr).toBe("Travaux");
    expect(answered.incidents[0]).not.toHaveProperty("textEn");
  });

  it("skips a feature with no id or no usable position", async () => {
    const answered = await incidentsOf(
      incidentsAnswer(
        { attributes: { commen: "No id" }, geometry: POINT },
        { attributes: { id: 2, commen: "No geometry" } },
        { attributes: { id: 3, commen: "Empty geometry" }, geometry: { x: "NaN", y: null } },
        { attributes: { id: 4, commen: "Kept" }, geometry: POINT },
      ),
    );
    if (answered.status !== "ok") throw new Error("expected incidents");
    expect(answered.incidents.map((incident) => incident.spwId)).toEqual([4]);
  });

  it.each<[string, Reply]>([
    ["a network error", "network-error"],
    ["a 503", { status: 503, body: "" }],
    ["a body that isn't JSON", { status: 200, body: "<html>" }],
    ["an ArcGIS error in a 200", { status: 200, body: '{"error":{"code":400,"message":"Invalid"}}' }],
  ])("%s on layer 0 fails the incidents and leaves the readings", async (_, reply) => {
    const source = fakeServer(undefined, reply).source();
    expect(await source.incidents()).toEqual(FAILED);
    expect((await source.readings()).status).toBe("ok");
  });

  it("a failure of layer 5 leaves the incidents", async () => {
    const source = fakeServer({ status: 503, body: "" }).source();
    expect(await source.readings()).toEqual(FAILED);
    expect((await source.incidents()).status).toBe("ok");
  });

  it("a layer 0 that hangs doesn't hold the readings back, and fails after the timeout", async () => {
    const server = fakeServer(undefined, "hangs");
    const source = server.source();
    expect((await source.readings()).status).toBe("ok");
    const incidents = source.incidents();
    server.advance(REQUEST_TIMEOUT_MS);
    expect(await incidents).toEqual(FAILED);
  });

  it("a layer 5 that hangs doesn't hold the incidents back", async () => {
    const server = fakeServer("hangs");
    const source = server.source();
    expect((await source.incidents()).status).toBe("ok");
    const readings = source.readings();
    server.advance(REQUEST_TIMEOUT_MS);
    expect(await readings).toEqual(FAILED);
  });
});
