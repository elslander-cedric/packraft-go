// #136: the Nominatim adapter on recorded responses (ADR 0019, ADR 0027): it never calls the live service.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_INTERVAL_MS, createNominatimNames } from "./nominatim";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const hotton = { lat: 50.268, lng: 5.446 };

type Reply = { status: number; body: string } | "network-error";

/** A stand-in Nominatim server: gives `reply` and logs every request with the clock at that moment. */
function fakeServer(reply: Reply | ((url: URL) => Reply)) {
  const requests: { url: URL; at: number }[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    requests.push({ url, at: Date.now() });
    const answer = typeof reply === "function" ? reply(url) : reply;
    if (answer === "network-error") throw new TypeError("Failed to fetch");
    return new Response(answer.body, { status: answer.status });
  };
  return { requests, names: createNominatimNames({ fetch }) };
}

const ok = (name: string) => ({ status: 200, body: fixture(name) });
const address = (fields: Record<string, string>) => ({ status: 200, body: JSON.stringify({ address: fields }) });

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Waits for a lookup while letting the fake clock run. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe("Nominatim requests", () => {
  it("asks for the reverse geocode of the position, in local names, at street level", async () => {
    const server = fakeServer(ok("reverse-road.json"));
    await settle(server.names.defaultNameAt(hotton));
    const [{ url }] = server.requests;
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/reverse");
    expect(url.searchParams.get("lat")).toBe("50.268");
    expect(url.searchParams.get("lon")).toBe("5.446");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("addressdetails")).toBe("1");
    expect(url.searchParams.get("zoom")).toBe("17");
    // A language no name is tagged in, so names come out as on the signs, whatever the browser's language.
    expect(url.searchParams.get("accept-language")).toBe("zxx");
  });

  it("never asks more than once a second, however many lookups wait", async () => {
    const server = fakeServer(ok("reverse-road.json"));
    const lookups = [0, 1, 2, 3].map((i) => server.names.defaultNameAt({ lat: hotton.lat + i / 1000, lng: hotton.lng }));
    await settle(Promise.all(lookups));
    const times = server.requests.map(({ at }) => at);
    expect(times).toHaveLength(4);
    times.slice(1).forEach((time, i) => expect(time - times[i]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS));
  });

  it("asks at once when the last request was more than a second ago", async () => {
    const server = fakeServer(ok("reverse-road.json"));
    await settle(server.names.defaultNameAt(hotton));
    vi.setSystemTime(Date.now() + 5000);
    const start = Date.now();
    void server.names.defaultNameAt(hotton);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.requests[1].at).toBe(start);
  });

  it("counts a failed request towards the limit too", async () => {
    const server = fakeServer("network-error");
    const lookups = [server.names.defaultNameAt(hotton), server.names.defaultNameAt(hotton)];
    await settle(Promise.all(lookups));
    expect(server.requests[1].at - server.requests[0].at).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
  });
});

describe("default names from Nominatim", () => {
  it.each([
    ["road and village (recorded at Melreux, Hotton)", ok("reverse-road.json"), "Rue du Batty, Melreux"],
    ["no road: the village alone (recorded near Marcouray)", ok("reverse-no-road.json"), "Marcouray"],
    ["nothing found (recorded in the North Sea)", ok("reverse-nothing-found.json"), ""],
    ["a road in a town", address({ road: "Rue de la Gare", town: "Durbuy", postcode: "6940" }), "Rue de la Gare, Durbuy"],
    ["a road in a city", address({ road: "Quai de Rome", city: "Liège" }), "Quai de Rome, Liège"],
    ["no village or town: the municipality", address({ road: "N86", municipality: "Rendeux" }), "N86, Rendeux"],
    ["only a municipality", address({ municipality: "Rendeux", country: "België / Belgique / Belgien" }), "Rendeux"],
    ["neither road nor place", address({ county: "Marche-en-Famenne", country: "België" }), ""],
  ])("%s", async (_, reply, name) => {
    const server = fakeServer(reply);
    expect(await settle(server.names.defaultNameAt(hotton))).toEqual({ status: "found", name });
  });

  it("leaves out house numbers, postcodes and countries", async () => {
    const reply = address({ house_number: "12", road: "Rue du Batty", village: "Melreux", postcode: "6990", country: "België" });
    expect(await settle(fakeServer(reply).names.defaultNameAt(hotton))).toEqual({
      status: "found",
      name: "Rue du Batty, Melreux",
    });
  });

  it.each<[string, Reply]>([
    ["a network error (offline)", "network-error"],
    ["service unavailable", { status: 503, body: "" }],
    ["too many requests", { status: 429, body: "" }],
    ["a body that isn't JSON", { status: 200, body: "<html>" }],
    ["JSON that isn't an answer", { status: 200, body: "[]" }],
    ["another error", { status: 200, body: JSON.stringify({ error: "Internal error" }) }],
  ])("a failure (%s) is failed, not nothing found, so it is asked again later", async (_, reply) => {
    expect(await settle(fakeServer(reply).names.defaultNameAt(hotton))).toEqual({ status: "failed" });
  });
});
