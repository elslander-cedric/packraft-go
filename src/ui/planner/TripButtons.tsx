import { useId } from "react";
import { canGoBackToStart, canUndo, type LegMode, type Trip } from "@/core/trip";
import { Button } from "../components/Button";
import { ToggleGroup } from "../components/ToggleGroup";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import { legModeOptions } from "./LegModeCard";

export type TripButtonsProps = {
  trip: Trip;
  nextMode: LegMode;
  onNextModeChange: (mode: LegMode) => void;
  onUndo: () => void;
  onBackToStart: () => void;
};

/**
 * The bottom-right stack: the next leg's mode, undo and back to start. A disabled button stays
 * a Tab stop and says why it is disabled.
 */
export default function TripButtons({ trip, nextMode, onNextModeChange, onUndo, onBackToStart }: TripButtonsProps) {
  const undoReasonId = useId();
  const backToStartReasonId = useId();
  return (
    <>
      <ToggleGroup
        label={strings.planner.nextLegModeLabel}
        value={nextMode}
        options={legModeOptions}
        onChange={onNextModeChange}
        className="planner-next-mode"
      />
      <Button
        className="planner-fab"
        aria-label={strings.undoButton}
        aria-describedby={canUndo(trip) ? undefined : undoReasonId}
        onClick={onUndo}
        disabled={!canUndo(trip)}
        focusableWhenDisabled
      >
        <Icon icon={icons.undo} />
      </Button>
      <Button
        className="planner-fab"
        aria-label={strings.planner.backToStartButton}
        aria-describedby={canGoBackToStart(trip) ? undefined : backToStartReasonId}
        onClick={onBackToStart}
        disabled={!canGoBackToStart(trip)}
        focusableWhenDisabled
      >
        <Icon icon={icons.backToStart} />
      </Button>
      <span id={undoReasonId} hidden>
        {strings.undoDisabledReason}
      </span>
      <span id={backToStartReasonId} hidden>
        {strings.planner.backToStartDisabledReason}
      </span>
    </>
  );
}
