// #172: place search through the shared Nominatim client, on recorded responses
// (ADR 0019, ADR 0030): it never calls the live service.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_INTERVAL_MS, createNominatim } from "./nominatim";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

/** The viewbox the fixtures were recorded with, around Hotton. */
const hottonArea = { west: 5.35, south: 50.22, east: 5.55, north: 50.32 };
const melreux = { lat: 50.268, lng: 5.446 };

type Reply = { status: number; body: string } | "network-error";

/** A stand-in Nominatim server: answers `/search` and `/reverse`, and logs every request with the clock. */
function fakeServer(reply: Reply | ((url: URL) => Reply)) {
  const requests: { url: URL; at: number }[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    requests.push({ url, at: Date.now() });
    const answer = typeof reply === "function" ? reply(url) : reply;
    if (answer === "network-error") throw new TypeError("Failed to fetch");
    return new Response(answer.body, { status: answer.status });
  };
  return { requests, ...createNominatim({ fetch }) };
}

const ok = (name: string) => ({ status: 200, body: fixture(name) });

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Waits for an answer while letting the fake clock run. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe("the search request", () => {
  it("sends the text and the visible area, in local names, for five results, and nothing else", async () => {
    const server = fakeServer(ok("search-hotton.json"));
    await settle(server.search.search("Hotton", hottonArea));
    const [{ url }] = server.requests;
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "Hotton",
      format: "jsonv2",
      addressdetails: "1",
      "accept-language": "zxx",
      limit: "5",
      viewbox: "5.35,50.22,5.55,50.32",
    });
  });
});

describe("search results from Nominatim", () => {
  it("Hotton (recorded): the municipality and the village, with their kinds, places and extents", async () => {
    const answer = await settle(fakeServer(ok("search-hotton.json")).search.search("Hotton", hottonArea));
    expect(answer).toEqual({
      status: "found",
      results: [
        {
          label: "Hotton",
          kind: "municipality",
          addressLine: "Marche-en-Famenne",
          at: { lat: expect.closeTo(50.27, 1), lng: expect.closeTo(5.44, 1) },
          box: { south: 50.2163115, north: 50.3190345, west: 5.3695106, east: 5.5034055 },
        },
        {
          label: "Hotton",
          kind: "village",
          addressLine: "Marche-en-Famenne",
          at: { lat: expect.closeTo(50.27, 1), lng: expect.closeTo(5.44, 1) },
          box: { south: 50.2163115, north: 50.3083966, west: 5.4048626, east: 5.5034055 },
        },
      ],
    });
  });

  it("Luik (recorded): finds Liège under its local name, told apart by kind; the province has a big extent", async () => {
    const answer = await settle(fakeServer(ok("search-luik.json")).search.search("Luik", hottonArea));
    expect(answer.status === "found" && answer.results.map(({ label, kind }) => ({ label, kind }))).toEqual([
      { label: "Liège", kind: "city" },
      { label: "Liège", kind: "province" },
      { label: "Liège", kind: "district" },
    ]);
    expect(answer.status === "found" && answer.results[1].box).toEqual({
      south: 50.1294854,
      north: 50.8121222,
      west: 4.9793071,
      east: 6.408097,
    });
  });

  it("Ourthe (recorded): river stretches told apart by their village and municipality", async () => {
    const answer = await settle(fakeServer(ok("search-ourthe.json")).search.search("Ourthe", hottonArea));
    expect(answer.status === "found" && answer.results.map(({ label, kind, addressLine }) => [label, kind, addressLine])).toEqual([
      ["Ourthe", "river", "Ronzon, Rendeux"],
      ["L'Ourthe", "river", "Melreux, Hotton"],
      ["L'Ourthe", "river", "Petite Enneille, Durbuy"],
    ]);
  });

  it("an address (recorded) has no name: the label is the start of the full address", async () => {
    const answer = await settle(fakeServer(ok("search-address.json")).search.search("Rue du Batty 12, Hotton", hottonArea));
    expect(answer).toEqual({
      status: "found",
      results: [
        {
          label: "12, Rue du Batty",
          kind: "address",
          addressLine: "Melreux, Hotton",
          at: { lat: expect.closeTo(melreux.lat, 2), lng: expect.closeTo(melreux.lng, 2) },
          box: { south: 50.2680413, north: 50.2682102, west: 5.4439223, east: 5.4441476 },
        },
      ],
    });
  });

  it("nothing found (recorded) is found with no results", async () => {
    const answer = await settle(fakeServer(ok("search-nothing-found.json")).search.search("qxzvbwplm", hottonArea));
    expect(answer).toEqual({ status: "found", results: [] });
  });
});

describe("search failures", () => {
  it.each<[string, Reply]>([
    ["a network error (offline)", "network-error"],
    ["service unavailable", { status: 503, body: "" }],
    ["too many requests", { status: 429, body: "" }],
    ["a body that isn't JSON", { status: 200, body: "<html>" }],
    ["JSON that isn't a list", { status: 200, body: JSON.stringify({ error: { code: 400, message: "Bad" } }) }],
  ])("%s is failed, not nothing found", async (_, reply) => {
    expect(await settle(fakeServer(reply).search.search("Hotton", hottonArea))).toEqual({ status: "failed" });
  });

  it("leaves out an entry with no position, and the extent of one whose box isn't four numbers", async () => {
    const body = JSON.stringify([
      { name: "Nowhere", lat: "", lon: "5.4" },
      { name: "Durbuy", lat: "50.35", lon: "5.46", boundingbox: ["50.3", "50.4", "5.4"] },
    ]);
    const answer = await settle(fakeServer({ status: 200, body }).search.search("Durbuy", hottonArea));
    expect(answer).toEqual({ status: "found", results: [{ label: "Durbuy", at: { lat: 50.35, lng: 5.46 } }] });
  });
});

describe("one line for default names and search", () => {
  const byPath = (url: URL): Reply => ok(url.pathname === "/search" ? "search-hotton.json" : "reverse-road.json");

  it("never asks more than once a second, default names and searches together", async () => {
    const server = fakeServer(byPath);
    const asked = [
      server.names.defaultNameAt(melreux),
      server.search.search("Hotton", hottonArea),
      server.names.defaultNameAt({ lat: 50.27, lng: 5.45 }),
      server.search.search("Ourthe", hottonArea),
    ];
    await settle(Promise.all(asked));
    const times = server.requests.map(({ at }) => at);
    expect(times).toHaveLength(4);
    times.slice(1).forEach((time, i) => expect(time - times[i]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS));
  });

  it("a waiting search goes before waiting default names, but never cuts off the running one", async () => {
    const server = fakeServer(byPath);
    const names = [0, 1, 2].map((i) => server.names.defaultNameAt({ lat: melreux.lat + i / 1000, lng: melreux.lng }));
    await vi.advanceTimersByTimeAsync(0);
    const search = server.search.search("Hotton", hottonArea);
    await settle(Promise.all([...names, search]));
    expect(server.requests.map(({ url }) => url.pathname)).toEqual(["/reverse", "/search", "/reverse", "/reverse"]);
  });

  it("default names come out as before while sharing the line", async () => {
    const server = fakeServer(byPath);
    const [name, found] = await settle(
      Promise.all([server.names.defaultNameAt(melreux), server.search.search("Hotton", hottonArea)]),
    );
    expect(name).toEqual({ status: "found", name: "Rue du Batty, Melreux" });
    expect(found.status).toBe("found");
  });
});

describe("answers kept for the session", () => {
  const pan = (area: typeof hottonArea, degrees: number) => ({
    west: area.west + degrees,
    south: area.south + degrees,
    east: area.east + degrees,
    north: area.north + degrees,
  });

  it("asks once for the same text in the same area, whatever its case and spaces, even after a small pan", async () => {
    const server = fakeServer(ok("search-hotton.json"));
    const first = await settle(server.search.search("Hotton", hottonArea));
    const again = await settle(server.search.search("  hOTTON ", pan(hottonArea, 0.001)));
    expect(server.requests).toHaveLength(1);
    expect(again).toEqual(first);
  });

  it("keeps nothing found too", async () => {
    const server = fakeServer(ok("search-nothing-found.json"));
    await settle(server.search.search("qxzvbwplm", hottonArea));
    await settle(server.search.search("qxzvbwplm", hottonArea));
    expect(server.requests).toHaveLength(1);
  });

  it("asks again after a big pan, or for other text", async () => {
    const server = fakeServer(ok("search-hotton.json"));
    await settle(server.search.search("Hotton", hottonArea));
    await settle(server.search.search("Hotton", pan(hottonArea, 0.2)));
    await settle(server.search.search("Hotton village", hottonArea));
    expect(server.requests).toHaveLength(3);
  });

  it("never keeps a failure, so Retry really asks again", async () => {
    let reply: Reply = { status: 503, body: "" };
    const server = fakeServer(() => reply);
    expect(await settle(server.search.search("Hotton", hottonArea))).toEqual({ status: "failed" });
    reply = ok("search-hotton.json");
    expect((await settle(server.search.search("Hotton", hottonArea))).status).toBe("found");
    expect(server.requests).toHaveLength(2);
  });

  it("never keeps default names", async () => {
    const server = fakeServer(ok("reverse-road.json"));
    await settle(server.names.defaultNameAt(melreux));
    await settle(server.names.defaultNameAt(melreux));
    expect(server.requests).toHaveLength(2);
  });
});
