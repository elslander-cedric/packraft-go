"use client";

// PROTOTYPE, throwaway (branch prototype/leg-mode-change): where should "change this leg's
// mode" live? Four variants on the real planner, switched with `?variant=`:
//   A  Row switch: a Hike/Paddle switch on every section and leg row.
//   B  Selection toggle: the bottom bar's mode toggle edits the selected section or leg.
//   C  Row menu: a ⋯ menu on every row with "Change to paddle/hike".
//   D  Map tap: tap a leg on the map for a floating card with its mode.
// A section's switch changes all its legs. Each leg is one setLegMode, so one undo step per leg.
// Strings live here, not in strings.ts, on purpose: this is throwaway.

import type { LegMode } from "@/core/trip";
import { Button } from "../components/Button";
import { Menu } from "../components/Menu";
import { ToggleGroup, type ToggleOption } from "../components/ToggleGroup";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

export const legModeVariants = [
  { key: "A", name: "Row switch" },
  { key: "B", name: "Selection toggle" },
  { key: "C", name: "Row menu" },
  { key: "D", name: "Map tap" },
] as const;
export type LegModeVariant = (typeof legModeVariants)[number]["key"];

export const prototypeStrings = {
  rowSwitchLabel: (what: string) => `${what} mode`,
  menuLabel: (what: string) => `${what} actions`,
  changeTo: (mode: LegMode) => (mode === "hike" ? "Change to hike" : "Change to paddle"),
  selectedModeLabel: (what: string) => `${what}'s mode`,
  cardTitle: (n: number, distance: string) => `Leg ${n} · ${distance}`,
  cardClose: "Close",
};

const other = (mode: LegMode): LegMode => (mode === "hike" ? "paddle" : "hike");

const options: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, icon: <Icon icon={icons.hike} />, className: "leg-mode leg-mode-hike" },
  { value: "paddle", label: strings.legModePaddle, icon: <Icon icon={icons.paddle} />, className: "leg-mode leg-mode-paddle" },
];

/** A row's mode control for variants A and C; none for B and D. */
export function RowModeControl({
  variant,
  what,
  mode,
  onChange,
}: {
  variant: LegModeVariant;
  /** "Section 2" or "Leg 3", for the control's name. */
  what: string;
  mode: LegMode;
  onChange: (mode: LegMode) => void;
}) {
  if (variant === "A")
    return (
      <ToggleGroup
        label={prototypeStrings.rowSwitchLabel(what)}
        value={mode}
        options={options}
        onChange={onChange}
        className="planner-next-mode proto-row-mode"
      />
    );
  if (variant === "C")
    return (
      <Menu
        label={prototypeStrings.menuLabel(what)}
        trigger={<span aria-hidden>⋯</span>}
        triggerClassName="proto-row-menu"
        align="end"
        items={[
          {
            label: prototypeStrings.changeTo(other(mode)),
            icon: <Icon icon={icons[other(mode)]} />,
            onSelect: () => onChange(other(mode)),
          },
        ]}
      />
    );
  return null;
}

/** Variant B: the bottom bar's toggle, for the selected section or leg. */
export function SelectedModeToggle({
  what,
  mode,
  onChange,
}: {
  what: string;
  mode: LegMode;
  onChange: (mode: LegMode) => void;
}) {
  return (
    <span className="proto-selected-mode">
      <span className="proto-selected-mode-label">{what}</span>
      <ToggleGroup
        label={prototypeStrings.selectedModeLabel(what)}
        value={mode}
        options={options}
        onChange={onChange}
        className="planner-next-mode"
      />
    </span>
  );
}

/** Variant D: the card a leg tap on the map opens. */
export function LegModeCard({
  leg,
  distance,
  mode,
  onChange,
  onClose,
}: {
  leg: number;
  distance: string;
  mode: LegMode;
  onChange: (mode: LegMode) => void;
  onClose: () => void;
}) {
  return (
    <div className="proto-leg-card" role="dialog" aria-label={prototypeStrings.cardTitle(leg + 1, distance)}>
      <span className="proto-leg-card-title">{prototypeStrings.cardTitle(leg + 1, distance)}</span>
      <ToggleGroup
        label={prototypeStrings.selectedModeLabel(strings.legLabel(leg + 1))}
        value={mode}
        options={options}
        onChange={onChange}
        className="planner-next-mode"
      />
      <Button className="planner-fab proto-leg-card-close" aria-label={prototypeStrings.cardClose} onClick={onClose}>
        <Icon icon={icons.deletePoint} />
      </Button>
    </div>
  );
}

/** Styles for the prototype only. */
export const prototypeCss = `
.proto-row-mode, .proto-selected-mode .planner-next-mode, .proto-leg-card .planner-next-mode {
  flex-direction: row; width: auto; }
.proto-row-mode .toggle, .proto-selected-mode .toggle, .proto-leg-card .toggle { min-width: 2.75rem; }
.planner-row-head > .proto-row-mode { align-self: center; margin-right: 8px; flex: none;
  background: var(--color-surface-muted, rgba(127,127,127,.15)); }
.button.proto-row-menu { align-self: center; flex: none; width: 44px; height: 44px; margin-right: 4px;
  background: none; border: 0; font-size: 22px; line-height: 1; border-radius: 8px; cursor: pointer; }
.button.proto-row-menu:hover { background: rgba(0,0,0,.06); }
.proto-selected-mode { display: inline-flex; align-items: center; gap: 6px; padding: 4px 4px 4px 10px;
  border-radius: 999px; background: var(--color-surface); box-shadow: 0 1px 4px rgba(0,0,0,.3); pointer-events: auto; }
.proto-selected-mode-label { font-size: 13px; font-weight: 600; }
.proto-leg-card { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 12px;
  background: var(--color-surface); box-shadow: 0 2px 10px rgba(0,0,0,.3); pointer-events: auto; }
.proto-leg-card-title { font-weight: 600; }
.button.proto-leg-card-close { width: 36px; height: 36px; box-shadow: none; }
`;
