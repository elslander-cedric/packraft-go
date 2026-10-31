import { useSyncExternalStore } from "react";

/**
 * Screens this narrow, and touch screens this short (a phone held sideways), hide the disclaimer
 * banner: the planner shows it in the access dialog instead (ADR 0026). Kept in step with the
 * rule in globals.css.
 */
export const PHONE_QUERY = "(max-width: 640px), (max-height: 640px) and (pointer: coarse)";

/**
 * A narrow screen in portrait gets the bottom sheet; every other screen (a phone held sideways,
 * tablets either way up, desktop) gets the side panel on the right (ADR 0034).
 */
export const SHEET_QUERY = "(max-width: 640px) and (orientation: portrait)";

/** Whether `query` matches, kept up to date; null on the server and while hydrating. */
function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // On the server (and while hydrating) the screen size isn't known yet.
    () => null,
  );
}

/** True when the planner gets the side panel instead of the bottom sheet (ADR 0034). */
export function useSideways(): boolean {
  return useMediaQuery(SHEET_QUERY) === false;
}
