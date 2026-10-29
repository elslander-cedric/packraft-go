// The side panel's width limits (ADR 0034): pure, so the panel and the page agree on them.

/** The open panel is at least this wide, unless the window is too narrow for it. */
const MIN_WIDTH_PX = 320;
/** The open panel covers at most this share of the window, so the map keeps the rest. */
const MAX_SHARE = 0.5;

/** The narrowest and widest the open panel can be in a window `windowWidth` px wide, in whole pixels. */
export function sidePanelWidthLimits(windowWidth: number): { min: number; max: number } {
  const max = Math.floor(windowWidth * MAX_SHARE);
  return { min: Math.min(MIN_WIDTH_PX, max), max };
}

/** `width` kept within the limits for the window, in whole pixels. */
export function sidePanelWidthWithin(width: number, windowWidth: number): number {
  const { min, max } = sidePanelWidthLimits(windowWidth);
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** The share of a window `windowWidth` px wide that the panel covers, open at `width` px. */
export function sidePanelCover(width: number, windowWidth: number): number {
  return sidePanelWidthWithin(width, windowWidth) / windowWidth;
}
