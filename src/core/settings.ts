/**
 * The planner's own pace, used for time estimates (ADR 0009).
 * - `paceFactor`: multiplies the Naismith hiking time; above 1 is slower.
 * - `paddleSpeedKmh`: average paddling speed in km/h.
 * Both are always positive, finite numbers.
 */
export type Settings = { readonly paceFactor: number; readonly paddleSpeedKmh: number };

export const defaultSettings: Settings = { paceFactor: 1, paddleSpeedKmh: 5 };

const isUsable = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Settings with one of them changed. A value that is not a positive number is ignored. */
export function withSetting(settings: Settings, name: keyof Settings, value: number): Settings {
  return isUsable(value) ? { ...settings, [name]: value } : settings;
}

/** Settings in their stored form (JSON). */
export function serialiseSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

/**
 * Settings from their stored form. Nothing stored, or anything unreadable,
 * gives the defaults; each unreadable setting falls back on its own.
 */
export function restoreSettings(stored: string | null): Settings {
  let parsed: unknown = null;
  try {
    parsed = stored === null ? null : JSON.parse(stored);
  } catch {
    // Unreadable: use the defaults.
  }
  if (typeof parsed !== "object" || parsed === null) return defaultSettings;
  const { paceFactor, paddleSpeedKmh } = parsed as Record<string, unknown>;
  return {
    paceFactor: isUsable(paceFactor) ? paceFactor : defaultSettings.paceFactor,
    paddleSpeedKmh: isUsable(paddleSpeedKmh) ? paddleSpeedKmh : defaultSettings.paddleSpeedKmh,
  };
}
