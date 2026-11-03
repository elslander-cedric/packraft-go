import { Button } from "../components/Button";
import { formatDistance } from "../format";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

export type PointCardProps = {
  /** The selected point (0-based). */
  point: number;
  /** How far along the route the point is from the start. */
  distanceKm: number;
  /** Whether the point is a camp. */
  camp: boolean;
  onDelete: () => void;
  onCamp: () => void;
  /** Unselects the point. */
  onClose: () => void;
};

/**
 * The selected point's card, floating above the sheet or panel where the snap offers
 * show: which point it is and how far along the route, and its delete and camp buttons, so
 * the map's bottom-right stack stays short enough to fit beside the raised sheet; like the
 * leg's card, a button unselects it.
 */
export default function PointCard({ point, distanceKm, camp, onDelete, onCamp, onClose }: PointCardProps) {
  const distance = formatDistance(distanceKm);
  const title = strings.planner.selectedPointTitle(point + 1, distance);
  return (
    <div className="planner-leg-card planner-point-card" role="group" aria-label={title}>
      {/* One line like the leg card's; on a screen too narrow for it, the distance goes under the number. */}
      <span className="planner-leg-card-title planner-point-card-title" aria-hidden>
        <span>{strings.planner.selectedPointName(point + 1)} ·</span> <span>{distance}</span>
      </span>
      {/* Side by side like the leg card's Hike / Paddle toggle, so the title keeps the room. */}
      <div className="planner-point-card-actions">
        <Button className="planner-point-card-button" aria-label={strings.deletePointButton} onClick={onDelete}>
          <Icon icon={icons.deletePoint} />
        </Button>
        <Button className="planner-point-card-button" aria-label={strings.campButton} aria-pressed={camp} onClick={onCamp}>
          <Icon icon={icons.camp} />
        </Button>
      </div>
      <Button className="planner-leg-card-close" aria-label={strings.planner.selectedPointClose} onClick={onClose}>
        <Icon icon={icons.unselect} />
      </Button>
    </div>
  );
}
