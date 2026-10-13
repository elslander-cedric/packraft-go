// Autosave of your access points in browser storage (#55, ADR 0023), under
// their own key, separate from the trip.
import { describe, expect, it } from "vitest";
import { serialiseAccessPoints, type AccessPoint } from "@/core/accessPoints";
import { ACCESS_POINTS_KEY, loadStoredAccessPoints, storeAccessPoints } from "./accessPointStorage";
import { TRIP_KEY } from "./tripStorage";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

const blockedStorage = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

const point: AccessPoint = {
  id: "a",
  position: { lat: 50.35, lng: 5.46 },
  use: "put-in",
  kind: "slipway",
  note: "",
  checkedOnSite: null,
  createdAt: "2026-10-13T08:00:00.000Z",
  updatedAt: "2026-10-13T08:00:00.000Z",
};

describe("access point storage", () => {
  it("stores the access points under their own key, apart from the trip, and loads them back", () => {
    const storage = memoryStorage({ [TRIP_KEY]: "the trip" });
    storeAccessPoints([point], storage);
    expect(ACCESS_POINTS_KEY).toBe("packraft-go.access-points");
    expect(storage.items.get(TRIP_KEY)).toBe("the trip");
    expect(loadStoredAccessPoints(storage)).toEqual({ accessPoints: [point], unknownVersion: false });
  });

  it("loads a save from an unknown version as none, flagged, and leaves it in storage", () => {
    const newer = JSON.stringify({ ...JSON.parse(serialiseAccessPoints([point])), version: 2 });
    const storage = memoryStorage({ [ACCESS_POINTS_KEY]: newer });
    expect(loadStoredAccessPoints(storage)).toEqual({ accessPoints: [], unknownVersion: true });
    expect(storage.items.get(ACCESS_POINTS_KEY)).toBe(newer);
  });

  it("gives no access points, and does not throw, when storage is blocked", () => {
    expect(loadStoredAccessPoints(blockedStorage)).toEqual({ accessPoints: [], unknownVersion: false });
    expect(() => storeAccessPoints([point], blockedStorage)).not.toThrow();
  });
});
