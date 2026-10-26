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
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
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
  key: (): string | null => {
    throw new Error("blocked");
  },
  length: 0,
};

const point: AccessPoint = {
  id: "a",
  position: { lat: 50.35, lng: 5.46 },
  name: "",
  nameSource: "to-look-up",
  use: "put-in",
  kind: "slipway",
  note: "",
  checkedOnSite: null,
  createdAt: "2026-10-13T08:00:00.000Z",
  updatedAt: "2026-10-13T08:00:00.000Z",
};

const nothingWrong = { unknownVersion: false, damaged: false, backupKey: null };

describe("access point storage", () => {
  it("stores the access points under their own key, apart from the trip, and loads them back", () => {
    const storage = memoryStorage({ [TRIP_KEY]: "the trip" });
    storeAccessPoints([point], storage);
    expect(ACCESS_POINTS_KEY).toBe("packraft-go.access-points");
    expect(storage.items.get(TRIP_KEY)).toBe("the trip");
    expect(loadStoredAccessPoints(storage)).toEqual({ accessPoints: [point], ...nothingWrong });
  });

  it("loads a save from an unknown version as none, flagged, and leaves it in storage", () => {
    const newer = JSON.stringify({ ...JSON.parse(serialiseAccessPoints([point])), version: 2 });
    const storage = memoryStorage({ [ACCESS_POINTS_KEY]: newer });
    expect(loadStoredAccessPoints(storage)).toEqual({ accessPoints: [], ...nothingWrong, unknownVersion: true });
    expect(storage.items.get(ACCESS_POINTS_KEY)).toBe(newer);
  });

  it("gives no access points, and does not throw, when storage is blocked", () => {
    expect(loadStoredAccessPoints(blockedStorage)).toEqual({ accessPoints: [], ...nothingWrong });
    expect(() => storeAccessPoints([point], blockedStorage)).not.toThrow();
  });
});

describe("a damaged access points save (round 2 of #55)", () => {
  const DAMAGED = '{"format":"packraft-go-access-points","version":1,"accessPoints":[{"id":"a"'; // cut short
  const at = () => "2026-10-13T08:00:00.000Z";
  const BACKUP = `${ACCESS_POINTS_KEY}.backup-2026-10-13T08:00:00.000Z`;

  it("is copied, as it was, to a backup key before the collection starts empty", () => {
    const storage = memoryStorage({ [ACCESS_POINTS_KEY]: DAMAGED });
    expect(loadStoredAccessPoints(storage, at)).toEqual({
      accessPoints: [],
      unknownVersion: false,
      damaged: true,
      backupKey: BACKUP,
    });
    expect(storage.items.get(BACKUP)).toBe(DAMAGED);
  });

  it("never overwrites an existing backup", () => {
    const storage = memoryStorage({ [ACCESS_POINTS_KEY]: DAMAGED, [BACKUP]: "an earlier backup" });
    expect(loadStoredAccessPoints(storage, at).backupKey).toBe(`${BACKUP}-2`);
    expect(storage.items.get(BACKUP)).toBe("an earlier backup");
    expect(storage.items.get(`${BACKUP}-2`)).toBe(DAMAGED);
  });

  it("is backed up once, even when it is loaded again before it is replaced", () => {
    const storage = memoryStorage({ [ACCESS_POINTS_KEY]: DAMAGED });
    loadStoredAccessPoints(storage, at);
    expect(loadStoredAccessPoints(storage, () => "2026-10-13T08:00:05.000Z").backupKey).toBe(BACKUP);
    expect([...storage.items.keys()].filter((key) => key.includes(".backup-"))).toEqual([BACKUP]);
  });

  it("gives no backup key when the backup can't be written, so it must not be replaced", () => {
    const full = memoryStorage({ [ACCESS_POINTS_KEY]: DAMAGED });
    full.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(loadStoredAccessPoints(full, at)).toEqual({
      accessPoints: [],
      unknownVersion: false,
      damaged: true,
      backupKey: null,
    });
  });
});
