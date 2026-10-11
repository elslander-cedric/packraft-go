/**
 * The planner's own pace, used for time estimates (ADR 0009).
 * - `paceFactor`: multiplies the Naismith hiking time; above 1 is slower.
 * - `paddleSpeedKmh`: average paddling speed in km/h.
 */
export type Settings = { readonly paceFactor: number; readonly paddleSpeedKmh: number };

export const defaultSettings: Settings = { paceFactor: 1, paddleSpeedKmh: 5 };
