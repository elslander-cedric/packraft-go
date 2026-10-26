import { useSyncExternalStore } from "react";

/**
 * Screens this narrow, and touch screens this short (a phone held sideways),
 * get the phone planner (ADR 0026): the full planner with a phone layout.
 * Wider screens, iPads included, get the desktop planner.
 */
export const PHONE_QUERY = "(max-width: 640px), (max-height: 640px) and (pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(PHONE_QUERY).matches;
// On the server (and while hydrating) the screen size isn't known yet.
const getServerSnapshot = () => null;

/** True on a phone-sized screen, false on a larger one, null until known. */
export function usePhoneLayout(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
