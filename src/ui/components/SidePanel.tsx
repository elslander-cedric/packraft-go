import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "./Button";
import { sidePanelWidthLimits, sidePanelWidthWithin } from "./sidePanelWidth";
import "./SidePanel.css";

/** How far one arrow key press moves the panel's edge, in pixels. */
const KEY_STEP_PX = 20;

/** The window's width, kept up to date; null on the server and while hydrating. */
function useWindowWidth(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerWidth,
    () => null,
  );
}

/** The width the open panel is drawn at for a chosen `width`: kept within the window's limits. */
export function useSidePanelWidth(width: number): number {
  const windowWidth = useWindowWidth();
  return windowWidth === null ? Math.round(width) : sidePanelWidthWithin(width, windowWidth);
}

export type SidePanelProps = {
  /** Accessible name of the panel. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The open panel's chosen width in pixels; drawn within the window's limits. */
  width: number;
  /** Called when a drag of the edge ends, or a key moves it, with the new width in whole pixels. */
  onWidthChange: (width: number) => void;
  /** Accessible name of the left edge, the splitter that resizes the open panel. */
  resizeLabel: string;
  /** Names and icons of the collapse and expand buttons. */
  collapseLabel: string;
  collapseIcon: ReactNode;
  expandLabel: string;
  expandIcon: ReactNode;
  /** Always shown: in the strip when collapsed, at the top when open. */
  summary: ReactNode;
  /** Shown under the summary while open, e.g. the tabs. */
  header?: ReactNode;
  /** Scrolls when it doesn't fit; kept mounted while collapsed. */
  children: ReactNode;
};

/**
 * A full-height panel on the right of the screen, beside the page (non-modal). Open, it shows
 * the summary, the header and the body, and its left edge resizes it (drag it, or the arrow
 * keys on it; ADR 0034); collapsed, a thin strip with the summary only. The sheet's
 * counterpart on every screen but a narrow one in portrait (#126, ADR 0034); it holds the
 * same content.
 */
export function SidePanel({
  label,
  open,
  onOpenChange,
  width,
  onWidthChange,
  resizeLabel,
  collapseLabel,
  collapseIcon,
  expandLabel,
  expandIcon,
  summary,
  header,
  children,
}: SidePanelProps) {
  const windowWidth = useWindowWidth() ?? 0;
  const chosen = useSidePanelWidth(width);
  const { min, max } = sidePanelWidthLimits(windowWidth);
  // While the edge is dragged: where the pointer went down, and the width then.
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  // The width while dragging, drawn at once and stored only when the drag ends.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const shown = dragWidth ?? chosen;

  const resize = (to: number) => {
    const within = sidePanelWidthWithin(to, windowWidth);
    if (within !== chosen) onWidthChange(within);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, width: shown };
    setDragWidth(shown);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start?.pointerId !== event.pointerId) return;
    // The edge is on the left: moving it left widens the panel.
    setDragWidth(sidePanelWidthWithin(start.width + start.x - event.clientX, windowWidth));
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (dragWidth !== null) resize(dragWidth);
    setDragWidth(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = {
      ArrowLeft: shown + KEY_STEP_PX,
      ArrowRight: shown - KEY_STEP_PX,
      Home: min,
      End: max,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    resize(to);
  };

  return (
    <aside
      className="side-panel"
      aria-label={label}
      data-open={open ? "" : undefined}
      data-resizing={dragWidth === null ? undefined : ""}
      style={{ "--side-panel-width": `${shown}px` } as CSSProperties}
    >
      {open && (
        <div
          className="side-panel-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={resizeLabel}
          aria-valuenow={shown}
          aria-valuemin={min}
          aria-valuemax={max}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={onKeyDown}
        />
      )}
      <div className="side-panel-top">
        <Button
          className="side-panel-toggle"
          aria-label={open ? collapseLabel : expandLabel}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {open ? collapseIcon : expandIcon}
        </Button>
        <div className="side-panel-summary">{summary}</div>
      </div>
      {open && header}
      <div className="side-panel-body" hidden={!open}>
        {children}
      </div>
    </aside>
  );
}
