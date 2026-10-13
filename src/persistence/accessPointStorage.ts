// Autosave of your access points in browser storage (#55, ADR 0023), under
// their own key: they belong to you, not to a trip. Thin on purpose: the
// format and its validation live in the core.
import {
  restoreStoredAccessPoints,
  serialiseAccessPoints,
  type AccessPoints,
  type StoredAccessPoints,
} from "@/core/accessPoints";

export const ACCESS_POINTS_KEY = "packraft-go.access-points";

type AccessPointStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): AccessPointStorage => window.localStorage;

/**
 * The stored access points, or none when there are none, they are unreadable,
 * or storage is blocked. `unknownVersion` says the stored save is from an
 * unknown version: it is left in storage and should not be overwritten.
 */
export function loadStoredAccessPoints(storage?: AccessPointStorage): StoredAccessPoints {
  let stored: string | null = null;
  try {
    // Even reaching localStorage can throw when it is disabled.
    stored = (storage ?? browserStorage()).getItem(ACCESS_POINTS_KEY);
  } catch {
    // Storage can be disabled (e.g. by privacy settings); start with none.
  }
  return restoreStoredAccessPoints(stored);
}

/** Saves the access points. Fails silently when storage is blocked or full: they stay in memory. */
export function storeAccessPoints(points: AccessPoints, storage?: AccessPointStorage): void {
  try {
    (storage ?? browserStorage()).setItem(ACCESS_POINTS_KEY, serialiseAccessPoints(points));
  } catch {
    // Nothing to do.
  }
}
