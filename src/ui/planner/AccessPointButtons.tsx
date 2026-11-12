import { Button } from "../components/Button";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import type { MarkAccessPoint } from "./useMarkAccessPoint";

export type AccessPointButtonsProps = {
  editing: boolean;
  marking: MarkAccessPoint;
  onEnter: () => void;
  onLeave: () => void;
};

/**
 * The bottom-left stack: the button that enters access point editing and, pressed again, leaves
 * it; while editing, the flag button that marks a point, with its state above it.
 */
export default function AccessPointButtons({ editing, marking, onEnter, onLeave }: AccessPointButtonsProps) {
  return (
    <>
      {marking.locating && (
        <p role="status" className="planner-message">
          {strings.planner.markLocating}
        </p>
      )}
      {marking.needsTap && (
        <p role="status" className="planner-message">
          {strings.planner.markTapMap}
        </p>
      )}
      {editing && (
        <Button
          className="planner-fab"
          aria-label={strings.planner.markAccessPointButton}
          onClick={marking.mark}
          disabled={marking.locating}
        >
          <Icon icon={icons.accessPoint} />
        </Button>
      )}
      <Button
        className={`planner-fab${editing ? " planner-fab-active" : ""}`}
        aria-label={strings.planner.editAccessPointsButton}
        aria-pressed={editing}
        onClick={editing ? onLeave : onEnter}
      >
        <Icon icon={editing ? icons.leaveAccessPointEditing : icons.editAccessPoints} />
      </Button>
    </>
  );
}
