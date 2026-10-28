import { useEffect, type RefObject } from "react";

/**
 * A leg a day card's warning chip asked to show (#58). Each request has its own `seq`,
 * so asking for the same leg again scrolls to it again.
 */
export type ShownLeg = { readonly leg: number; readonly seq: number };

/** Scrolls a leg list's row for the shown leg to the top of its list, once per request. */
export function useScrollToShownLeg(list: RefObject<HTMLOListElement | null>, shown: ShownLeg | null) {
  useEffect(() => {
    if (shown) list.current?.children[shown.leg]?.scrollIntoView({ block: "start" });
  }, [list, shown]);
}
