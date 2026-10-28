/** The base maps the planner can choose from (ADR 0031), the first one the default. */
export const baseMapIds = ["opentopomap", "aerial-be", "ngi-topo"] as const;

export type BaseMapId = (typeof baseMapIds)[number];

/**
 * The planner's settings on this device.
 * - `paceFactor`: multiplies the Naismith hiking time; above 1 is slower (ADR 0009).
 * - `paddleSpeedKmh`: average paddling speed in km/h (ADR 0009).
 *   Both are always positive, finite numbers.
 * - `baseMap`: the base map shown under the trip (ADR 0031). A viewing preference:
 *   never part of the trip, its file or the GPX.
 */
export type Settings = {
  readonly paceFactor: number;
  readonly paddleSpeedKmh: number;
  readonly baseMap: BaseMapId;
};

/** The settings that are numbers: the planner's pace. */
export type PaceSetting = "paceFactor" | "paddleSpeedKmh";

/** The settings time estimates use. */
export type Pace = Pick<Settings, PaceSetting>;

export const defaultSettings: Settings = { paceFactor: 1, paddleSpeedKmh: 5, baseMap: baseMapIds[0] };

/** True for a value a setting can take: a positive, finite number. */
export const isUsableSetting = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Settings with one of them changed. A value that is not a positive number is ignored. */
export function withSetting(settings: Settings, name: PaceSetting, value: number): Settings {
  return isUsableSetting(value) ? { ...settings, [name]: value } : settings;
}

/** True for the id of one of the base maps. */
export const isBaseMapId = (value: unknown): value is BaseMapId => baseMapIds.some((id) => id === value);

/** Settings with another base map chosen; the same settings when it is already the one. */
export function withBaseMap(settings: Settings, baseMap: BaseMapId): Settings {
  return settings.baseMap === baseMap ? settings : { ...settings, baseMap };
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
  const { paceFactor, paddleSpeedKmh, baseMap } = parsed as Record<string, unknown>;
  return {
    paceFactor: isUsableSetting(paceFactor) ? paceFactor : defaultSettings.paceFactor,
    paddleSpeedKmh: isUsableSetting(paddleSpeedKmh) ? paddleSpeedKmh : defaultSettings.paddleSpeedKmh,
    baseMap: isBaseMapId(baseMap) ? baseMap : defaultSettings.baseMap,
  };
}
