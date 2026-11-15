import { describe, expect, it } from "vitest";
import { BROUTER_MIN_INTERVAL_MS, createBRouterClient } from "./brouterClient";

function fakes(cached: Record<string, string> = {}, statuses: number[] = []) {
  const cache = new Map(Object.entries(cached));
  const fetched: { url: string; userAgent: string }[] = [];
  const waits: number[] = [];
  let clock = 0;
  const client = createBRouterClient({
    fetch: async (url, init) => {
      fetched.push({ url, userAgent: init.headers["User-Agent"] });
      const status = statuses.shift() ?? 200;
      return { status, text: async () => `answer ${fetched.length}` };
    },
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    cache: {
      read: async (url) => cache.get(url),
      write: async (url, body) => void cache.set(url, body),
    },
  });
  return { client, cache, fetched, waits };
}

describe("the BRouter client of the route network script", () => {
  it("reuses a cached answer without asking BRouter", async () => {
    const { client, fetched } = fakes({
      "https://brouter.de/a": JSON.stringify({ status: 200, body: "kept" }),
    });
    expect(await client.answer("https://brouter.de/a")).toEqual({
      status: 200,
      body: "kept",
    });
    expect(fetched).toEqual([]);
  });

  it("asks for a missing answer once, identified by the project URL only, and caches it", async () => {
    const { client, fetched } = fakes();
    expect(await client.answer("https://brouter.de/a")).toEqual({
      status: 200,
      body: "answer 1",
    });
    expect(await client.answer("https://brouter.de/a")).toEqual({
      status: 200,
      body: "answer 1",
    });
    expect(fetched).toEqual([
      {
        url: "https://brouter.de/a",
        userAgent:
          "packraft-go (+https://github.com/elslander-cedric/packraft-go)",
      },
    ]);
  });

  it("caches a no-route answer too, so it isn't asked again", async () => {
    const { client, fetched } = fakes({}, [400]);
    await client.answer("https://brouter.de/a");
    expect(await client.answer("https://brouter.de/a")).toEqual({
      status: 400,
      body: "answer 1",
    });
    expect(fetched).toHaveLength(1);
  });

  it("pauses between two requests", async () => {
    const { client, waits } = fakes();
    await client.answer("https://brouter.de/a");
    await client.answer("https://brouter.de/b");
    expect(waits).toEqual([BROUTER_MIN_INTERVAL_MS]);
  });

  it("retries a busy server after a longer pause, and never caches its answer", async () => {
    const { client, cache, fetched } = fakes({}, [503]);
    expect(await client.answer("https://brouter.de/a")).toEqual({
      status: 200,
      body: "answer 2",
    });
    expect(fetched).toHaveLength(2);
    expect(JSON.parse(cache.get("https://brouter.de/a") ?? "")).toEqual({
      status: 200,
      body: "answer 2",
    });
  });

  it("gives up after a few failed attempts", async () => {
    const { client, cache } = fakes({}, [503, 503, 503, 503]);
    await expect(client.answer("https://brouter.de/a")).rejects.toThrow(/503/);
    expect(cache.size).toBe(0);
  });
});
