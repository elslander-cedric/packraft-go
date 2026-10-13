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

/** Damaged saves are copied to keys starting with this, followed by the time of the copy. */
export const ACCESS_POINTS_BACKUP_PREFIX = `${ACCESS_POINTS_KEY}.backup-`;

type AccessPointStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

const browserStorage = (): AccessPointStorage => window.localStorage;

/**
 * The stored access points, as the core restored them, plus where a damaged
 * save was backed up. `backupKey` is null when nothing was damaged, or when the
 * backup could not be written: then the damaged save must not be overwritten.
 */
export type LoadedAccessPoints = StoredAccessPoints & { readonly backupKey: string | null };

/** The key of an existing backup holding exactly `text`, if any. */
function existingBackup(storage: AccessPointStorage, text: string): string | null {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(ACCESS_POINTS_BACKUP_PREFIX) && storage.getItem(key) === text) return key;
  }
  return null;
}

/**
 * Copies a damaged save to a new backup key (round 2 of #55), never over an
 * existing backup, and only once per damaged text. Null when it can't be written.
 */
function backUp(storage: AccessPointStorage, text: string, now: () => string): string | null {
  try {
    const known = existingBackup(storage, text);
    if (known) return known;
    const base = `${ACCESS_POINTS_BACKUP_PREFIX}${now()}`;
    let key = base;
    for (let n = 2; storage.getItem(key) !== null; n++) key = `${base}-${n}`;
    storage.setItem(key, text);
    return key;
  } catch {
    return null;
  }
}

/**
 * The stored access points, or none when there are none, they are unreadable,
 * or storage is blocked. `unknownVersion` says the stored save is from an
 * unknown version: it is left in storage and should not be overwritten. A
 * damaged save is backed up first (see `backupKey`).
 */
export function loadStoredAccessPoints(
  storage?: AccessPointStorage,
  now: () => string = () => new Date().toISOString(),
): LoadedAccessPoints {
  let stored: string | null = null;
  let target: AccessPointStorage | null = null;
  try {
    // Even reaching localStorage can throw when it is disabled.
    target = storage ?? browserStorage();
    stored = target.getItem(ACCESS_POINTS_KEY);
  } catch {
    // Storage can be disabled (e.g. by privacy settings); start with none.
  }
  const restored = restoreStoredAccessPoints(stored);
  const backupKey = restored.damaged && target && stored !== null ? backUp(target, stored, now) : null;
  return { ...restored, backupKey };
}

/** Saves the access points. Fails silently when storage is blocked or full: they stay in memory. */
export function storeAccessPoints(points: AccessPoints, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? browserStorage()).setItem(ACCESS_POINTS_KEY, serialiseAccessPoints(points));
  } catch {
    // Nothing to do.
  }
}
