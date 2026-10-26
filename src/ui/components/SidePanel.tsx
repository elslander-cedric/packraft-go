import type { ReactNode } from "react";
import { Button } from "./Button";
import "./SidePanel.css";

/** The open panel takes this share of the screen's width, up to `PANEL_MAX_PX`. Matches `--side-panel-width` in SidePanel.css. */
const PANEL_SHARE = 0.45;
const PANEL_MAX_PX = 380;

/** The share of a screen `screenWidth` px wide that the open panel covers. */
export function sidePanelCover(screenWidth: number): number {
  return Math.min(PANEL_SHARE, PANEL_MAX_PX / screenWidth);
}

export type SidePanelProps = {
  /** Accessible name of the panel. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names and glyphs of the collapse and expand buttons. */
  collapseLabel: string;
  collapseGlyph: string;
  expandLabel: string;
  expandGlyph: string;
  /** Always shown: in the strip when collapsed, at the top when open. */
  summary: ReactNode;
  /** Shown under the summary while open, e.g. the tabs. */
  header?: ReactNode;
  /** Scrolls when it doesn't fit; kept mounted while collapsed. */
  children: ReactNode;
};

/**
 * A full-height panel on the right of the screen, beside the page (non-modal). Open, it shows
 * the summary, the header and the body; collapsed, a thin strip with the summary only. The
 * sheet's counterpart when a phone is held sideways (#126); it holds the same content.
 */
export function SidePanel({
  label,
  open,
  onOpenChange,
  collapseLabel,
  collapseGlyph,
  expandLabel,
  expandGlyph,
  summary,
  header,
  children,
}: SidePanelProps) {
  return (
    <aside className="side-panel" aria-label={label} data-open={open ? "" : undefined}>
      <div className="side-panel-top">
        <Button
          className="side-panel-toggle"
          aria-label={open ? collapseLabel : expandLabel}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {open ? collapseGlyph : expandGlyph}
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
