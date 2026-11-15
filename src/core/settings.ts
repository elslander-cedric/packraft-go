/** The base maps the planner can choose from (ADR 0031), the first one the default. */
export const baseMapIds = ["opentopomap", "aerial-be", "ngi-topo"] as const;

export type BaseMapId = (typeof baseMapIds)[number];

/** The overlays that can be switched on over any base map (ADR 0032). */
export const overlayIds = ["hiking-trails"] as const;

export type OverlayId = (typeof overlayIds)[number];

/**
 * The planner's settings on this device.
 * - `paceFactor`: multiplies the Naismith hiking time; above 1 is slower (ADR 0009).
 * - `paddleSpeedKmh`: average paddling speed in km/h (ADR 0009).
 *   Both are always positive, finite numbers.
 * - `baseMap`: the base map shown under the trip (ADR 0031). A viewing preference:
 *   never part of the trip, its file or the GPX.
 * - `overlays`: the overlays switched on (ADR 0032), each once, in the order of `overlayIds`.
 *   A viewing preference like the base map.
 * - `sidePanelWidth`: the side panel's open width in whole pixels, as last dragged (ADR 0034).
 *   The panel keeps it within the screen's limits when it draws it.
 * - `sidePanelOpen`: whether the side panel is open rather than collapsed to its strip.
 *   Both are viewing preferences like the base map.
 * - `tripWishes`: what suggested trips should be (ADR 0039). Never part of a trip.
 */
export type Settings = {
  readonly paceFactor: number;
  readonly paddleSpeedKmh: number;
  readonly baseMap: BaseMapId;
  readonly overlays: readonly OverlayId[];
  readonly sidePanelWidth: number;
  readonly sidePanelOpen: boolean;
  readonly tripWishes: TripWishes;
};

/** Whether a suggested trip ends where it starts (`loop`), somewhere else (`one-way`), or either. */
export const tripShapes = ["loop", "one-way", "either"] as const;
export type TripShape = (typeof tripShapes)[number];

/**
 * Trip wishes (GLOSSARY): what you'd like a suggested trip to be. The date is not one of
 * them: it is never remembered and defaults to today.
 * - `paddleKm`: about how many km to paddle, a positive number; absent for no preference.
 * - `maxSwitches`: the most mode switches, a whole number from 0; every put-in and every
 *   take-out counts one. A hard maximum.
 */
export type TripWishes = {
  readonly paddleKm?: number;
  readonly maxSwitches: number;
  readonly shape: TripShape;
};

/** The settings that are numbers: the planner's pace. */
export type PaceSetting = "paceFactor" | "paddleSpeedKmh";

/** The settings time estimates use. */
export type Pace = Pick<Settings, PaceSetting>;

export const defaultSettings: Settings = {
  paceFactor: 1,
  paddleSpeedKmh: 5,
  baseMap: baseMapIds[0],
  overlays: [],
  sidePanelWidth: 380,
  sidePanelOpen: true,
  tripWishes: { paddleKm: 10, maxSwitches: 2, shape: "either" },
};

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

/** Settings with an overlay switched on or off; the same settings when it already is. */
export function withOverlay(settings: Settings, overlay: OverlayId, on: boolean): Settings {
  if (settings.overlays.includes(overlay) === on) return settings;
  return { ...settings, overlays: overlayIds.filter((id) => (id === overlay ? on : settings.overlays.includes(id))) };
}

/**
 * Settings with the side panel's width or state changed; the same settings when nothing changes.
 * The width is rounded to whole pixels; one that is not a positive number is ignored.
 */
export function withSidePanel(settings: Settings, change: { width?: number; open?: boolean }): Settings {
  const width = change.width === undefined ? settings.sidePanelWidth : Math.round(change.width);
  const sidePanelWidth = isUsableSetting(width) ? width : settings.sidePanelWidth;
  const sidePanelOpen = change.open ?? settings.sidePanelOpen;
  if (sidePanelWidth === settings.sidePanelWidth && sidePanelOpen === settings.sidePanelOpen) return settings;
  return { ...settings, sidePanelWidth, sidePanelOpen };
}

const isMaxSwitches = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isTripShape = (value: unknown): value is TripShape => tripShapes.some((shape) => shape === value);

/** Settings with other trip wishes; the same settings when a wish can't be kept (e.g. a paddle distance of 0). */
export function withTripWishes(settings: Settings, tripWishes: TripWishes): Settings {
  const { paddleKm, maxSwitches, shape } = tripWishes;
  const usable = (paddleKm === undefined || isUsableSetting(paddleKm)) && isMaxSwitches(maxSwitches) && isTripShape(shape);
  return usable ? { ...settings, tripWishes } : settings;
}

/**
 * Trip wishes from their stored form, each unreadable wish falling back on its own. A missing
 * paddle distance is no preference; one that isn't a positive number gets the default.
 */
function restoreTripWishes(stored: unknown): TripWishes {
  const defaults = defaultSettings.tripWishes;
  // Settings stored before trip wishes existed have none.
  if (typeof stored !== "object" || stored === null) return defaults;
  const { paddleKm, maxSwitches, shape } = stored as Record<string, unknown>;
  const restoredKm = isUsableSetting(paddleKm) ? paddleKm : defaults.paddleKm;
  return {
    ...(paddleKm === undefined ? {} : { paddleKm: restoredKm }),
    maxSwitches: isMaxSwitches(maxSwitches) ? maxSwitches : defaults.maxSwitches,
    shape: isTripShape(shape) ? shape : defaults.shape,
  };
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
  const { paceFactor, paddleSpeedKmh, baseMap, overlays, sidePanelWidth, sidePanelOpen, tripWishes } = parsed as Record<
    string,
    unknown
  >;
  return {
    paceFactor: isUsableSetting(paceFactor) ? paceFactor : defaultSettings.paceFactor,
    paddleSpeedKmh: isUsableSetting(paddleSpeedKmh) ? paddleSpeedKmh : defaultSettings.paddleSpeedKmh,
    baseMap: isBaseMapId(baseMap) ? baseMap : defaultSettings.baseMap,
    // Unknown ids are dropped, so an overlay that is gone never comes back as another.
    overlays: Array.isArray(overlays) ? overlayIds.filter((id) => overlays.includes(id)) : defaultSettings.overlays,
    // Settings stored before the panel was resizable have neither: it opens at its default width.
    sidePanelWidth: isUsableSetting(sidePanelWidth) ? Math.round(sidePanelWidth) : defaultSettings.sidePanelWidth,
    sidePanelOpen: typeof sidePanelOpen === "boolean" ? sidePanelOpen : defaultSettings.sidePanelOpen,
    tripWishes: restoreTripWishes(tripWishes),
  };
}
