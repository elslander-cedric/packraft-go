import { Drawer } from "@base-ui/react/drawer";
import { useCallback, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
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
  /** Accessible name of the handle, which the keys move between the stops. */
  handleLabel: string;
  /** How the handle reads out each stop. */
  stopLabels: Record<SheetStop, string>;
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
 * three stops, picked by how far it is dragged. From the keyboard, the handle
 * is a slider over the stops: arrow up and down go one stop, Home and End to
 * the peek and the top (#189). It isn't a button, so a drag can start on it.
 * At the peek the sheet's body is off screen and inert, so Tab doesn't land there.
 */
export function BottomSheet({
  label,
  handleLabel,
  stopLabels,
  stop,
  onStopChange,
  peek,
  children,
  onPeekHeightChange,
}: BottomSheetProps) {
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
  const at = stops.indexOf(stop);
  const onHandleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = {
      ArrowUp: Math.min(at + 1, stops.length - 1),
      ArrowRight: Math.min(at + 1, stops.length - 1),
      ArrowDown: Math.max(at - 1, 0),
      ArrowLeft: Math.max(at - 1, 0),
      Home: 0,
      End: stops.length - 1,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    if (to !== at) onStopChange(stops[to]);
  };
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
              <div
                className="bottom-sheet-handle"
                role="slider"
                tabIndex={0}
                aria-label={handleLabel}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={stops.length - 1}
                aria-valuenow={at}
                aria-valuetext={stopLabels[stop]}
                onKeyDown={onHandleKeyDown}
              />
              {peek}
            </div>
            <Drawer.Content className="bottom-sheet-body" inert={stop === "peek"}>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
