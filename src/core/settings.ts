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
 */
export type Settings = {
  readonly paceFactor: number;
  readonly paddleSpeedKmh: number;
  readonly baseMap: BaseMapId;
  readonly overlays: readonly OverlayId[];
  readonly sidePanelWidth: number;
  readonly sidePanelOpen: boolean;
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
  const { paceFactor, paddleSpeedKmh, baseMap, overlays, sidePanelWidth, sidePanelOpen } = parsed as Record<
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
  };
}
