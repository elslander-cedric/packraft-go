import type { LegMode } from "@/core/trip";
import { Button } from "../components/Button";
import { ToggleGroup, type ToggleOption } from "../components/ToggleGroup";
import { formatDistance } from "../format";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

/** Hike / Paddle, icon-only, in the legs' colours: the next leg's toggle and the selected leg's. */
export const legModeOptions: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, icon: <Icon icon={icons.hike} />, className: "leg-mode leg-mode-hike" },
  {
    value: "paddle",
    label: strings.legModePaddle,
    icon: <Icon icon={icons.paddle} />,
    className: "leg-mode leg-mode-paddle",
  },
];

export type LegModeCardProps = {
  /** The selected leg (0-based). */
  leg: number;
  mode: LegMode;
  distanceKm: number;
  /** The other mode was pressed. */
  onChange: (mode: LegMode) => void;
  /** Unselects the leg. */
  onClose: () => void;
};

/**
 * The selected leg's card (#230), floating above the sheet or panel where the snap offers
 * show: which leg it is, its mode as a Hike / Paddle toggle, and a button that unselects it.
 */
export default function LegModeCard({ leg, mode, distanceKm, onChange, onClose }: LegModeCardProps) {
  const title = strings.planner.selectedLegTitle(leg + 1, formatDistance(distanceKm));
  return (
    <div className="planner-leg-card" role="group" aria-label={title}>
      <span className="planner-leg-card-title">{title}</span>
      <ToggleGroup
        label={strings.legModeLabel(leg + 1)}
        value={mode}
        options={legModeOptions}
        onChange={onChange}
        className="planner-leg-card-mode"
      />
      <Button className="planner-leg-card-close" aria-label={strings.planner.selectedLegClose} onClick={onClose}>
        <Icon icon={icons.unselect} />
      </Button>
    </div>
  );
}
