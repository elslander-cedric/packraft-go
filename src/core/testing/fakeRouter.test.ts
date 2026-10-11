import { describe, expect, it } from "vitest";
import type { RouteResult, Router } from "../router";
import { createFakeRouter } from "./fakeRouter";

const hikeResult: RouteResult = {
  ok: true,
  geometry: [
    { lat: 50.1, lng: 4.1, elevation: 120 },
    { lat: 50.15, lng: 4.12, elevation: 160 },
  ],
};

describe("fake router", () => {
  it("answers a leg of a given mode with the result recorded for that mode", async () => {
    const router: Router = createFakeRouter({ hike: hikeResult });
    const result = await router.route("hike", [
      { lat: 50.1, lng: 4.1 },
      { lat: 50.15, lng: 4.12 },
    ]);
    expect(result).toEqual(hikeResult);
  });

  it("answers a mode with no recorded result with a typed no-route failure", async () => {
    const router = createFakeRouter({ hike: hikeResult });
    const result = await router.route("paddle", [
      { lat: 50.1, lng: 4.1 },
      { lat: 50.2, lng: 4.2 },
    ]);
    expect(result).toEqual({ ok: false, failure: { kind: "no-route" } });
  });

  it("can stand in for an unavailable routing service", async () => {
    const router = createFakeRouter({ hike: { ok: false, failure: { kind: "unavailable" } } });
    const result = await router.route("hike", [
      { lat: 50.1, lng: 4.1 },
      { lat: 50.2, lng: 4.2 },
    ]);
    expect(result).toEqual({ ok: false, failure: { kind: "unavailable" } });
  });

  it("remembers which legs it was asked to route", async () => {
    const router = createFakeRouter({ hike: hikeResult });
    const points = [
      { lat: 50.1, lng: 4.1 },
      { lat: 50.15, lng: 4.12 },
    ];
    await router.route("hike", points);
    expect(router.calls).toEqual([{ mode: "hike", points }]);
  });
});
