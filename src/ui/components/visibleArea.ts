import { useCallback, useEffect, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

/** The part of the layout the planner can see: what is left above an on-screen keyboard. */
export type VisibleArea = { top: number; height: number };

/**
 * The CSS variables Dialog.css centres and caps a dialog with: the visible area's top and
 * height in pixels. Without an area (no `visualViewport`, or closed) the dialog falls back to
 * the full screen.
 */
export function visibleAreaStyle(area: VisibleArea | null): CSSProperties {
  if (area === null || !(area.height > 0)) return {};
  return {
    "--visible-top": `${Math.round(area.top)}px`,
    "--visible-height": `${Math.round(area.height)}px`,
  } as CSSProperties;
}

// The snapshot is a string, so it compares by value between renders.
const snapshot = () => {
  const viewport = window.visualViewport;
  return viewport ? `${viewport.offsetTop} ${viewport.height}` : "";
};
const noArea = () => "";

/**
 * Keeps an open dialog in the visible area (#163): follows `window.visualViewport`, which
 * shrinks when the on-screen keyboard opens, and returns the style for the dialog's popup.
 * When the area changes, the focused field in `popup` scrolls back into view.
 */
export function useVisibleArea(open: boolean, popup: RefObject<HTMLElement | null>): CSSProperties {
  const subscribe = useCallback(
    (changed: () => void) => {
      const viewport = window.visualViewport;
      if (!open || !viewport) return () => {};
      viewport.addEventListener("resize", changed);
      viewport.addEventListener("scroll", changed);
      return () => {
        viewport.removeEventListener("resize", changed);
        viewport.removeEventListener("scroll", changed);
      };
    },
    [open],
  );
  const current = useSyncExternalStore(subscribe, open ? snapshot : noArea, noArea);

  useEffect(() => {
    const focused = document.activeElement;
    if (current !== "" && focused instanceof HTMLElement && popup.current?.contains(focused)) {
      focused.scrollIntoView?.({ block: "nearest" });
    }
  }, [current, popup]);

  if (current === "") return {};
  const [top, height] = current.split(" ").map(Number);
  return visibleAreaStyle({ top, height });
}

/** True on a touch screen, where focusing a text field opens the on-screen keyboard. */
export function hasCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}
