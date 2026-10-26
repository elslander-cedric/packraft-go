// #136, ADR 0027: points without a name of yours get their default name, one
// lookup at a time, whenever the app is online, and never block marking.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAccessPoint,
  applyDefaultName,
  updateAccessPoint,
  type AccessPoints,
  type DefaultNameLookup,
} from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";
import { RETRY_MS, startDefaultNames } from "./defaultNames";

const T = "2026-10-26T08:00:00.000Z";
const hotton = { lat: 50.268, lng: 5.446 };
const durbuy = { lat: 50.3527, lng: 5.4563 };
const names: Record<string, string> = { "50.268,5.446": "Rue du Batty, Melreux", "50.3527,5.4563": "Rue de la Gare, Durbuy" };

/** A planner with points, a fake default name source, and the queue working on them. */
function setUp(start: AccessPoints, { online = true, answer }: { online?: boolean; answer?: () => DefaultNameLookup } = {}) {
  const world = { points: start, online, asked: [] as LatLng[] };
  const queue = startDefaultNames({
    source: {
      defaultNameAt: async (at) => {
        world.asked.push(at);
        return answer?.() ?? { status: "found", name: names[`${at.lat},${at.lng}`] ?? "" };
      },
    },
    points: () => world.points,
    found: (id, at, name) => (world.points = applyDefaultName(world.points, id, { at, name })),
    online: () => world.online,
  });
  return { world, queue };
}

const twoPoints = addAccessPoint(addAccessPoint([], { id: "a", at: hotton, now: T }), { id: "b", at: durbuy, now: T });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("default names", () => {
  it("are looked up for every point that needs one, in order, one at a time", async () => {
    const { world, queue } = setUp(twoPoints);
    queue.wake();
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([hotton, durbuy]);
    expect(world.points.map((p) => [p.name, p.nameSource])).toEqual([
      ["Rue du Batty, Melreux", "default"],
      ["Rue de la Gare, Durbuy", "default"],
    ]);
  });

  it("are not looked up for a name you typed or a default name already found", async () => {
    const typed = updateAccessPoint(twoPoints, "a", { name: "Hotton bridge" }, T);
    const { world, queue } = setUp(applyDefaultName(typed, "b", { at: durbuy, name: "" }));
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([]);
  });

  it("wait while offline, and are looked up when the app is back online", async () => {
    const { world, queue } = setUp(twoPoints, { online: false });
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([]);
    expect(world.points[0].nameSource).toBe("to-look-up");

    world.online = true;
    queue.backOnline();
    await vi.runAllTimersAsync();
    expect(world.points[0].name).toBe("Rue du Batty, Melreux");
  });

  it("after a failure, are asked again later, not at once", async () => {
    let failing = true;
    const { world, queue } = setUp(twoPoints, {
      answer: () => (failing ? { status: "failed" } : { status: "found", name: "Rue du Batty, Melreux" }),
    });
    queue.wake();
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(world.asked).toEqual([hotton]);
    expect(world.points[0].nameSource).toBe("to-look-up");

    failing = false;
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(world.points[0]).toMatchObject({ name: "Rue du Batty, Melreux", nameSource: "default" });
  });

  it("after a failure, are not asked again on every edit, but as soon as the app comes back online", async () => {
    let failing = true;
    const { world, queue } = setUp(twoPoints, { answer: () => (failing ? { status: "failed" } : { status: "found", name: "X" }) });
    queue.wake();
    await vi.advanceTimersByTimeAsync(0);
    queue.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(world.asked).toHaveLength(1);

    failing = false;
    queue.backOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(world.asked).toHaveLength(3);
    expect(world.points.map((p) => p.name)).toEqual(["X", "X"]);
  });

  it("are not asked twice for the same position while the answer is on its way to the points", async () => {
    const world = { points: twoPoints, asked: [] as LatLng[] };
    const queue = startDefaultNames({
      source: { defaultNameAt: async (at) => (world.asked.push(at), { status: "found", name: "X" }) },
      points: () => world.points,
      found: () => {}, // the planner applies it later
      online: () => true,
    });
    queue.wake();
    await vi.runAllTimersAsync();
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([hotton, durbuy]);
  });

  it("a point moved after its default name was found is looked up again", async () => {
    const { world, queue } = setUp(twoPoints.slice(0, 1));
    queue.wake();
    await vi.runAllTimersAsync();
    world.points = updateAccessPoint(world.points, "a", { position: durbuy }, T);
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([hotton, durbuy]);
    expect(world.points[0].name).toBe("Rue de la Gare, Durbuy");
  });

  it("a name cleared where the default name was found is looked up again", async () => {
    const { world, queue } = setUp(twoPoints.slice(0, 1));
    queue.wake();
    await vi.runAllTimersAsync();
    world.points = updateAccessPoint(world.points, "a", { name: "Hotton bridge" }, T);
    queue.wake();
    world.points = updateAccessPoint(world.points, "a", { name: "" }, T);
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([hotton, hotton]);
    expect(world.points[0]).toMatchObject({ name: "Rue du Batty, Melreux", nameSource: "default" });
  });

  it("stop when stopped", async () => {
    const { world, queue } = setUp(twoPoints);
    queue.stop();
    queue.wake();
    await vi.runAllTimersAsync();
    expect(world.asked).toEqual([]);
  });
});
