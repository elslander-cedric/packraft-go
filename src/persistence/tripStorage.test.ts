// Autosave of the trip in browser storage (#9, #28).
import { describe, expect, it } from "vitest";
import { serialiseTrip } from "@/core/saveFile";
import { emptyTrip, type Trip } from "@/core/trip";
import { loadStoredTrip, storeTrip, TRIP_KEY } from "./tripStorage";

/** An in-memory stand-in for the browser's localStorage. */
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

const trip: Trip = { name: "Lesse", points: [{ lat: 50.2, lng: 5.0 }], legs: [] };

describe("trip storage", () => {
  it("stores the trip under its key and loads it back", () => {
    const storage = memoryStorage();
    storeTrip(trip, storage);
    expect([...storage.items.keys()]).toEqual([TRIP_KEY]);
    expect(loadStoredTrip(storage)).toEqual({ trip, unknownVersion: false });
  });

  it("loads a save from a newer version as an empty trip, flagged, and leaves it in storage", () => {
    const newer = JSON.stringify({ ...JSON.parse(serialiseTrip(trip)), version: 3 });
    const storage = memoryStorage({ [TRIP_KEY]: newer });
    expect(loadStoredTrip(storage)).toEqual({ trip: emptyTrip(), unknownVersion: true });
    expect(storage.items.get(TRIP_KEY)).toBe(newer);
  });

  it("loads corrupt data as an empty trip, not flagged", () => {
    expect(loadStoredTrip(memoryStorage({ [TRIP_KEY]: "{corrupt" }))).toEqual({
      trip: emptyTrip(),
      unknownVersion: false,
    });
  });

  it("starts empty when storage is blocked, and storing fails silently", () => {
    expect(loadStoredTrip(blockedStorage)).toEqual({ trip: emptyTrip(), unknownVersion: false });
    expect(() => storeTrip(trip, blockedStorage)).not.toThrow();
  });
});
