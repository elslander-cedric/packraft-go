import { Drawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";
import "./BottomSheet.css";

/** Where the sheet rests: just the header, half the screen, or nearly all of it. */
export type SheetStop = "peek" | "half" | "full";

/** Snap points: the peek is a fixed height, the others are fractions of the screen. */
const snapPoints = ["8rem", 0.5, 0.9];
const stops: readonly SheetStop[] = ["peek", "half", "full"];

export type BottomSheetProps = {
  /** Accessible name of the sheet. */
  label: string;
  stop: SheetStop;
  onStopChange: (stop: SheetStop) => void;
  /** Always visible, and the part you drag. */
  peek: ReactNode;
  /** Scrolls when it doesn't fit. */
  children: ReactNode;
};

/**
 * A sheet over the bottom of the screen (Base UI Drawer, ADR 0020). It never
 * closes and doesn't block the page behind it (non-modal), and settles at one of
 * three stops, picked by how far it is dragged.
 */
export function BottomSheet({ label, stop, onStopChange, peek, children }: BottomSheetProps) {
  return (
    <Drawer.Root
      open
      // The sheet never closes: dragging it down past the peek just settles it back.
      onOpenChange={() => {}}
      modal={false}
      disablePointerDismissal
      snapPoints={snapPoints}
      snapPoint={snapPoints[stops.indexOf(stop)]}
      onSnapPointChange={(point) => {
        // Dragged below the peek (towards closing): settle at the peek.
        const index = point === null ? 0 : snapPoints.indexOf(point);
        if (index >= 0) onStopChange(stops[index]);
      }}
      snapToSequentialPoints
    >
      <Drawer.Portal>
        <Drawer.Viewport className="bottom-sheet-viewport">
          <Drawer.Popup className="bottom-sheet" aria-label={label} data-stop={stop} initialFocus={false}>
            <div className="bottom-sheet-peek">
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
