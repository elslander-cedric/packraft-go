// Default names for your access points (#136, ADR 0027): the points still
// waiting for one are looked up one at a time, whenever the app is online.
// Marking never waits for it: a point is saved at once and named when a lookup
// succeeds. The rate limit is the source's (the Nominatim adapter's).
import { toLookUp, type AccessPoints, type DefaultNameSource } from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";

/** After a failed lookup, ask again this much later (or as soon as the app is back online). */
export const RETRY_MS = 60_000;

export type DefaultNamesOptions = {
  source: DefaultNameSource;
  /** Your access points as they are now. */
  points: () => AccessPoints;
  /** A default name was found (maybe "") for point `id` at `at`. */
  found: (id: string, at: LatLng, name: string) => void;
  online: () => boolean;
};

export type DefaultNames = {
  /** Looks up whatever is waiting, unless already at it or waiting to retry. Call on every change. */
  wake: () => void;
  /** The app is back online: retry at once. */
  backOnline: () => void;
  stop: () => void;
};

const positionKey = (at: LatLng) => `${at.lat},${at.lng}`;

export function startDefaultNames({ source, points, found, online }: DefaultNamesOptions): DefaultNames {
  let busy = false;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  // Positions already answered per point, until the points show the answer: `found` may apply it later.
  const answered = new Map<string, string>();

  function next() {
    const waiting = toLookUp(points());
    const ids = new Set(waiting.map((point) => point.id));
    for (const id of answered.keys()) if (!ids.has(id)) answered.delete(id);
    return waiting.find((point) => answered.get(point.id) !== positionKey(point.position));
  }

  async function work() {
    busy = true;
    try {
      for (let point = next(); point && !stopped && online(); point = next()) {
        const at = point.position;
        const lookup = await source.defaultNameAt(at);
        if (stopped) return;
        if (lookup.status === "failed") {
          retry = setTimeout(backOnline, RETRY_MS);
          return;
        }
        answered.set(point.id, positionKey(at));
        found(point.id, at, lookup.name);
      }
    } finally {
      busy = false;
    }
  }

  function wake() {
    if (busy || stopped || retry !== null) return;
    void work();
  }

  function backOnline() {
    if (retry !== null) clearTimeout(retry);
    retry = null;
    wake();
  }

  return {
    wake,
    backOnline,
    stop: () => {
      stopped = true;
      if (retry !== null) clearTimeout(retry);
    },
  };
}
