// The Overpass client used by the offline stretch preparation script (#54).
// It must be polite: project URL as User-Agent, one request at a time with at
// least a second between requests, and a local cache so re-runs don't re-fetch.
// No test here calls the network (ADR 0019): fetch, wait and the cache are fakes.
import { describe, expect, it } from "vitest";
import { createOverpassClient, OVERPASS_USER_AGENT } from "./overpass";

function fakes(answers: Array<{ status: number; body: string }>) {
  const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
  const waits: number[] = [];
  const cache = new Map<string, string>();
  let clock = 0;
  const client = createOverpassClient({
    endpoint: "https://overpass.example/api/interpreter",
    fetch: async (url, init) => {
      calls.push({ url, init });
      const answer = answers.shift() ?? { status: 500, body: "no answer left" };
      return { status: answer.status, text: async () => answer.body };
    },
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    cache: {
      read: async (key) => cache.get(key),
      write: async (key, value) => {
        cache.set(key, value);
      },
    },
  });
  return { client, calls, waits, cache };
}

const EMPTY = { status: 200, body: '{"elements":[]}' };

describe("Overpass client", () => {
  it("identifies itself with the project URL only, never an email", async () => {
    const { client, calls } = fakes([EMPTY]);
    await client.query("[out:json];node(1);out;");
    expect(calls[0].init.headers["User-Agent"]).toBe(OVERPASS_USER_AGENT);
    expect(OVERPASS_USER_AGENT).toBe("packraft-go (+https://github.com/elslander-cedric/packraft-go)");
    expect(JSON.stringify(calls[0])).not.toMatch(/[a-z0-9.]+@[a-z0-9-]+\./i);
  });

  it("returns the parsed elements and caches them, so a re-run doesn't re-fetch", async () => {
    const { client, calls } = fakes([{ status: 200, body: '{"elements":[{"type":"node","id":1,"lat":50,"lon":5}]}' }]);
    const first = await client.query("Q");
    const second = await client.query("Q");
    expect(first.elements).toEqual([{ type: "node", id: 1, lat: 50, lon: 5 }]);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it("leaves at least a second between two live requests", async () => {
    const { client, waits } = fakes([EMPTY, EMPTY]);
    await client.query("A");
    await client.query("B");
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1000);
  });

  it("retries a busy server after a longer pause, then gives up with an error", async () => {
    const busy = { status: 429, body: "rate limited" };
    const { client, calls, waits } = fakes([busy, { status: 504, body: "timeout" }, EMPTY]);
    await expect(client.query("A")).resolves.toEqual({ elements: [] });
    expect(calls).toHaveLength(3);
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(5000);

    const failing = fakes([busy, busy, busy, busy, busy]);
    await expect(failing.client.query("A")).rejects.toThrow(/429/);
    expect(failing.cache.size).toBe(0);
  });

  it("treats an Overpass runtime error remark as a failure, not as data", async () => {
    const timedOut = { status: 200, body: '{"elements":[],"remark":"runtime error: Query timed out"}' };
    const { client, cache } = fakes([timedOut, timedOut, timedOut, timedOut]);
    await expect(client.query("A")).rejects.toThrow(/timed out/);
    expect(cache.size).toBe(0);
  });
});
