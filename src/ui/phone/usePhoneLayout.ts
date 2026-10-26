import { useSyncExternalStore } from "react";

/**
 * Screens this narrow, and touch screens this short (a phone held sideways),
 * get the phone planner (ADR 0026): the full planner with a phone layout.
 * Wider screens, iPads included, get the desktop planner.
 */
export const PHONE_QUERY = "(max-width: 640px), (max-height: 640px) and (pointer: coarse)";

/** Within the phone layout, a screen wider than tall gets the side panel instead of the sheet (#126). */
export const SIDEWAYS_QUERY = "(orientation: landscape)";

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

/** True on a phone-sized screen, false on a larger one, null until known. */
export function usePhoneLayout(): boolean | null {
  return useMediaQuery(PHONE_QUERY);
}

/** True while the screen is wider than tall (a phone held sideways), false otherwise or until known. */
export function useSideways(): boolean {
  return useMediaQuery(SIDEWAYS_QUERY) === true;
}
