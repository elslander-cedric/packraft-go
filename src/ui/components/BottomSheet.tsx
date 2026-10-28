import { Drawer } from "@base-ui/react/drawer";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import "./BottomSheet.css";

/** Where the sheet rests: just the header, half the screen, or nearly all of it. */
export type SheetStop = "peek" | "half" | "full";

/** The peek's least height; it grows when its content needs more, e.g. a wrapped header. */
const MIN_PEEK_PX = 128;
const stops: readonly SheetStop[] = ["peek", "half", "full"];
/** The share of the screen's height the sheet covers at the stops above the peek. */
export const sheetStopShare: Record<Exclude<SheetStop, "peek">, number> = { half: 0.5, full: 0.9 };

export type BottomSheetProps = {
  /** Accessible name of the sheet. */
  label: string;
  stop: SheetStop;
  onStopChange: (stop: SheetStop) => void;
  /** Always visible, and the part you drag. */
  peek: ReactNode;
  /** Scrolls when it doesn't fit. */
  children: ReactNode;
  /** Called with the peek's height in pixels whenever it changes, e.g. to keep buttons above it. */
  onPeekHeightChange?: (px: number) => void;
};

/**
 * A sheet over the bottom of the screen (Base UI Drawer, ADR 0020). It never
 * closes and doesn't block the page behind it (non-modal), and settles at one of
 * three stops, picked by how far it is dragged.
 */
export function BottomSheet({ label, stop, onStopChange, peek, children, onPeekHeightChange }: BottomSheetProps) {
  // Snap points: the peek fits its content (at least MIN_PEEK_PX), the others are fractions of the screen.
  const [peekPx, setPeekPx] = useState(MIN_PEEK_PX);
  const measurePeek = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const observer = new ResizeObserver(() => {
        // From the sheet's top edge, so its border counts too.
        const sheetTop = element.parentElement!.getBoundingClientRect().top;
        const px = Math.max(MIN_PEEK_PX, Math.ceil(element.getBoundingClientRect().bottom - sheetTop));
        setPeekPx(px);
        onPeekHeightChange?.(px);
      });
      observer.observe(element);
      return () => observer.disconnect();
    },
    [onPeekHeightChange],
  );
  const snapPoints = [`${peekPx}px`, sheetStopShare.half, sheetStopShare.full];
  return (
    <Drawer.Root
      open
      // The sheet never closes: dragging it down past the peek just settles it back. Escape is
      // not the sheet's to take: let it go on to the page, e.g. to a dialog opened from the
      // sheet before focus has moved into it, or to the planner's deselect.
      onOpenChange={(_open, details) => {
        if (details.reason === "escape-key") {
          details.cancel();
          details.allowPropagation();
        }
      }}
      modal={false}
      disablePointerDismissal
      snapPoints={snapPoints}
      snapPoint={snapPoints[stops.indexOf(stop)]}
      onSnapPointChange={(point, details) => {
        // Dragged below the peek (towards closing): settle at the peek. Cancelling the dismissal
        // keeps the drawer from restoring the stop the drag started from afterwards.
        if (point === null) {
          details.cancel();
          onStopChange("peek");
          return;
        }
        const index = snapPoints.indexOf(point);
        if (index >= 0) onStopChange(stops[index]);
      }}
      snapToSequentialPoints
    >
      <Drawer.Portal>
        <Drawer.Viewport className="bottom-sheet-viewport">
          <Drawer.Popup
            className="bottom-sheet"
            aria-label={label}
            data-stop={stop}
            initialFocus={false}
            style={{ "--bottom-sheet-peek": `${peekPx}px` } as CSSProperties}
          >
            <div className="bottom-sheet-peek" ref={measurePeek}>
              <div className="bottom-sheet-handle" aria-hidden />
              {peek}
            </div>
            <Drawer.Content className="bottom-sheet-body">{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
