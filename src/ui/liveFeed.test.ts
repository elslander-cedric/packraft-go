// A live answer shared by everything on the page (#203 story 45): one timer, one answer, and
// nothing asked while nothing wants it. The 15-minute cap itself is the adapters' cache, so the
// last tests run a feed over the real PKAYAK and KiWIS sources with a fake clock and fake fetch.
import { describe, expect, it, vi } from "vitest";
import { CACHE_MS as KIWIS_CACHE_MS, createKiwisFlowSource } from "@/hydrometry/kiwis";
import { CACHE_MS as PKAYAK_CACHE_MS, createPkayakStatusSource } from "@/kayak/pkayak";
import { REFRESH_MS, createLiveFeed, keepOnSuccess } from "./liveFeed";

/** Timers fired by hand, and how long the waiting one was set for. */
function fakeTimers() {
  let waiting: { fire: () => void; ms: number } | null = null;
  return {
    setTimer: (fire: () => void, ms: number) => {
      const timer = { fire, ms };
      waiting = timer;
      return () => {
        if (waiting === timer) waiting = null;
      };
    },
    get waitingMs() {
      return waiting?.ms ?? null;
    },
    fire() {
      const timer = waiting;
      waiting = null;
      timer?.fire();
    },
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve));

/** A feed answering "answer 1", "answer 2"… */
function countingFeed() {
  const timers = fakeTimers();
  const ask = vi.fn(async () => `answer ${ask.mock.calls.length}`);
  return { timers, ask, feed: createLiveFeed(ask, { everyMs: REFRESH_MS, setTimer: timers.setTimer }) };
}

describe("a live feed", () => {
  it("asks nothing until something wants it", async () => {
    const { ask, feed, timers } = countingFeed();
    await settled();
    expect(ask).not.toHaveBeenCalled();
    expect(feed.answer()).toBeUndefined();
    expect(timers.waitingMs).toBeNull();
  });

  it("asks when first wanted, and tells everyone who wants it", async () => {
    const { ask, feed } = countingFeed();
    const [map, trip] = [vi.fn(), vi.fn()];
    feed.subscribe(map);
    feed.subscribe(trip);
    await settled();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(feed.answer()).toBe("answer 1");
    expect(map).toHaveBeenCalledTimes(1);
    expect(trip).toHaveBeenCalledTimes(1);
  });

  it("asks again on a timer while wanted, so everyone gets the same new answer", async () => {
    const { ask, feed, timers } = countingFeed();
    const [map, trip] = [vi.fn(), vi.fn()];
    feed.subscribe(map);
    await settled();
    feed.subscribe(trip); // Joins late, and shares the one timer.
    expect(timers.waitingMs).toBe(REFRESH_MS);

    timers.fire();
    await settled();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(feed.answer()).toBe("answer 2");
    expect(map).toHaveBeenCalledTimes(2);
    expect(trip).toHaveBeenCalledTimes(1);
  });

  it("stops asking once nothing wants it, and keeps its answer", async () => {
    const { ask, feed, timers } = countingFeed();
    const stop = feed.subscribe(vi.fn());
    await settled();
    stop();
    expect(timers.waitingMs).toBeNull();
    await settled();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(feed.answer()).toBe("answer 1");
  });

  it("keeps asking for as long as one of two still wants it", async () => {
    const { feed, timers } = countingFeed();
    const stopMap = feed.subscribe(vi.fn());
    feed.subscribe(vi.fn());
    await settled();
    stopMap();
    expect(timers.waitingMs).toBe(REFRESH_MS);
  });

  it("starts no timer for an answer that arrives after nothing wants it", async () => {
    const { feed, timers } = countingFeed();
    const stop = feed.subscribe(vi.fn());
    stop();
    await settled();
    expect(timers.waitingMs).toBeNull();
  });

  it("asks at once when wanted again", async () => {
    const { ask, feed, timers } = countingFeed();
    feed.subscribe(vi.fn())();
    await settled();
    feed.subscribe(vi.fn());
    await settled();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(timers.waitingMs).toBe(REFRESH_MS);
  });

  it("doesn't let an old answer replace a newer one", async () => {
    const answers: ((answer: string) => void)[] = [];
    const feed = createLiveFeed(() => new Promise<string>((resolve) => answers.push(resolve)), {
      everyMs: REFRESH_MS,
      setTimer: fakeTimers().setTimer,
    });
    feed.subscribe(vi.fn())();
    feed.subscribe(vi.fn());
    answers[1]("new");
    await settled();
    answers[0]("old");
    await settled();
    expect(feed.answer()).toBe("new");
  });

  it("stops by itself once the answer is settled, as for a chunk that has loaded", async () => {
    const timers = fakeTimers();
    let answer = "failed";
    const ask = vi.fn(async () => answer);
    const feed = createLiveFeed(ask, {
      everyMs: 1000,
      setTimer: timers.setTimer,
      settled: (value) => value === "loaded",
    });
    feed.subscribe(vi.fn());
    await settled();
    expect(timers.waitingMs).toBe(1000);

    answer = "loaded";
    timers.fire();
    await settled();
    expect(feed.answer()).toBe("loaded");
    expect(timers.waitingMs).toBeNull();

    // A settled answer isn't asked for again, even by something new that wants it.
    feed.subscribe(vi.fn());
    await settled();
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe("keeping what a lazy load gave", () => {
  it("loads once when it works", async () => {
    const load = vi.fn(async () => "chunk");
    const chunk = keepOnSuccess(load);
    expect(await chunk()).toBe("chunk");
    expect(await chunk()).toBe("chunk");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares a load in progress", async () => {
    const load = vi.fn(async () => "chunk");
    const chunk = keepOnSuccess(load);
    await Promise.all([chunk(), chunk()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("doesn't keep a failure: a later attempt loads again", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("chunk");
    const chunk = keepOnSuccess(load);
    await expect(chunk()).rejects.toThrow("offline");
    expect(await chunk()).toBe("chunk");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("over the real sources", () => {
  const HOUR_MS = 60 * 60 * 1000;

  /** Runs a feed for an hour of fake time, moving the clock on as each timer fires. */
  async function runForAnHour<T>(ask: (now: () => number) => Promise<T>) {
    const timers = fakeTimers();
    let clock = 0;
    const answers = vi.fn();
    const feed = createLiveFeed(() => ask(() => clock), { everyMs: REFRESH_MS, setTimer: timers.setTimer });
    const stop = feed.subscribe(answers);
    await settled();
    while (clock + REFRESH_MS <= HOUR_MS && timers.waitingMs !== null) {
      clock += timers.waitingMs;
      timers.fire();
      await settled();
    }
    stop();
    return answers;
  }

  it("waits exactly as long as the adapters' caches, so a re-ask is always a real refresh", () => {
    expect(REFRESH_MS).toBe(PKAYAK_CACHE_MS);
    expect(REFRESH_MS).toBe(KIWIS_CACHE_MS);
  });

  it("heals a failing PKAYAK at the next refresh, at one refresh per 15 minutes", async () => {
    let up = false;
    const fetched: string[] = [];
    const fetch = async (url: string) => {
      fetched.push(url);
      return up ? new Response('{"features":[]}') : new Response("", { status: 503 });
    };
    const statuses: string[] = [];
    let source: ReturnType<typeof createPkayakStatusSource> | undefined;
    await runForAnHour(async (now) => {
      source ??= createPkayakStatusSource({ fetch, now, setTimer: () => () => {} });
      const readings = await source.readings();
      statuses.push(readings.status);
      up = true;
      return readings;
    });
    expect(statuses).toEqual(["failed", "ok", "ok", "ok", "ok"]);
    expect(fetched).toHaveLength(5); // 0, 15, 30, 45 and 60 minutes.
  });

  it("two feeds at the same moment make one refresh of two requests", async () => {
    const fetched: string[] = [];
    const fetch = async (url: string) => {
      fetched.push(url);
      return new Response('{"features":[]}');
    };
    let clock = 0;
    const source = createPkayakStatusSource({ fetch, now: () => clock, setTimer: () => () => {} });
    const timers = [fakeTimers(), fakeTimers()];
    const feeds = [
      createLiveFeed<unknown>(() => source.readings(), { everyMs: REFRESH_MS, setTimer: timers[0].setTimer }),
      createLiveFeed<unknown>(() => source.incidents(), { everyMs: REFRESH_MS, setTimer: timers[1].setTimer }),
    ];
    feeds.forEach((feed) => feed.subscribe(vi.fn()));
    await settled();
    expect(fetched).toHaveLength(2);

    clock += REFRESH_MS;
    timers.forEach((timer) => timer.fire());
    await settled();
    expect(fetched).toHaveLength(4);
  });

  it("heals a failing KiWIS at the next refresh", async () => {
    let up = false;
    const fetch = async () => {
      const reply = up ? new Response('[["station_no","ts_id","ts_name"]]') : new Response("", { status: 503 });
      up = true;
      return reply;
    };
    let source: ReturnType<typeof createKiwisFlowSource> | undefined;
    const statuses: string[] = [];
    await runForAnHour(async (now) => {
      source ??= createKiwisFlowSource({ fetch, now, setTimer: () => () => {} });
      const readings = await source.readings(["L1"]);
      statuses.push(readings.status);
      return readings;
    });
    expect(statuses[0]).toBe("failed");
    expect(statuses[1]).not.toBe("failed");
  });
});
