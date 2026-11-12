import { useState } from "react";
import type { SheetStop } from "@/core/plannerSession";
import type { MapCover } from "@/map/SearchResultLayer";
import { sheetStopShare } from "../components/BottomSheet";
import { useSidePanelWidth } from "../components/SidePanel";
import { sidePanelCover } from "../components/sidePanelWidth";
import { useSidePanel } from "../useSettings";
import { useSideways } from "./usePlannerLayout";

export type Panel = ReturnType<typeof usePanel>;

/**
 * Where the planner's content sits: the bottom sheet on a narrow screen in portrait, the side
 * panel everywhere else (`sideways`). Both are kept, so turning the screen restores each as it was.
 */
export function usePanel(editingAccessPoints: boolean) {
  const sideways = useSideways();

  const [stop, setStop] = useState<SheetStop>("peek");
  // Measured by the sheet, so the bottom buttons can sit just above it.
  const [peekPx, setPeekPx] = useState<number | null>(null);

  // The side panel's width and open state are settings on this device. While editing access
  // points the open state is not stored: a reload comes back in normal mode with the panel as
  // it was before entering.
  const [stored, changeStored] = useSidePanel();
  const [openWhileEditing, setOpenWhileEditing] = useState(true);
  const open = editingAccessPoints ? openWhileEditing : stored.open;
  const setOpen = (next: boolean) => (editingAccessPoints ? setOpenWhileEditing(next) : changeStored({ open: next }));
  const shownWidth = useSidePanelWidth(stored.width);

  return {
    sideways,
    stop,
    setStop,
    peekPx,
    setPeekPx,
    open,
    setOpen,
    width: stored.width,
    setWidth: (width: number) => changeStored({ width }),
    shownWidth,
    /** Opens the panel for this visit to access point editing; the stored setting is left alone. */
    openForEditing: () => setOpenWhileEditing(true),
    /** Shows the content: the sheet raised to half, or the panel opened. */
    raise: () => (sideways ? setOpen(true) : setStop("half")),
    /** The same, but a sheet already above the peek stays where it is. */
    raiseFromPeek: () => {
      if (sideways) setOpen(true);
      else if (stop === "peek") setStop("half");
    },
    /** The share of the map the raised sheet or the open panel covers, for a map focus. */
    covered: () =>
      sideways
        ? { coveredBelow: 0, coveredRight: sidePanelCover(stored.width, window.innerWidth) }
        : { coveredBelow: 0.5 },
  };
}

/**
 * What hides the map right now, in pixels: the place search pill and the access chip under it,
 * and the sheet or the side panel. Measured from the planner's root element.
 */
export function measureMapCover(root: HTMLElement | null, panel: Panel): MapCover {
  const top = root?.getBoundingClientRect().top ?? 0;
  const rows = root?.querySelectorAll(".planner-place-search, .planner-access-chip-slot") ?? [];
  const rowsBottom = Math.max(top, ...Array.from(rows, (row) => row.getBoundingClientRect().bottom));
  const panelWidth = root?.querySelector(".side-panel")?.getBoundingClientRect().width ?? 0;
  const sheetHeight = panel.stop === "peek" ? (panel.peekPx ?? 0) : sheetStopShare[panel.stop] * window.innerHeight;
  return {
    top: rowsBottom - top,
    right: panel.sideways ? panelWidth : 0,
    bottom: panel.sideways ? 0 : sheetHeight,
  };
}
