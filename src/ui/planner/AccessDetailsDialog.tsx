import type { AccessFeature, AccessStatus, LockMarker } from "@/core/access";
import type { Obstacle } from "@/core/obstacle";
import type { OfficialAire, OfficialStretch } from "@/core/officialAire";
import { AccessDetail, LockDetail, ObstacleDetail, OfficialAireDetail } from "../AccessPanel";
import { InfoDialog } from "../components/InfoDialog";
import { strings } from "../strings";

export type AccessDetailsDialogProps = {
  /** The water whose details are open, if any. */
  water?: AccessFeature;
  /** The lock whose details are open, if any. */
  lock?: LockMarker;
  /** The official aire whose details are open, if any, its official stretch and that stretch's access status. */
  aire?: OfficialAire;
  aireStretch?: OfficialStretch;
  aireStatus?: AccessStatus;
  /** The obstacle whose details are open, if any. */
  obstacle?: Obstacle;
  /** The date the water's or the aire's status is for. */
  date: string;
  onClose: () => void;
};

/** A water's, a lock's, an official aire's or an obstacle's details (#125), in a dialog over the map. */
export default function AccessDetailsDialog({
  water,
  lock,
  aire,
  aireStretch,
  aireStatus,
  obstacle,
  date,
  onClose,
}: AccessDetailsDialogProps) {
  const obstacleName = obstacle && strings.obstacles.names[obstacle.kind];
  return (
    <InfoDialog
      open={water !== undefined || lock !== undefined || aire !== undefined || obstacle !== undefined}
      title={water?.record.name ?? lock?.name ?? aire?.name ?? obstacleName ?? ""}
      closeLabel={strings.accessDetailClose}
      onClose={onClose}
    >
      {water ? (
        <AccessDetail feature={water} date={date} />
      ) : lock ? (
        <LockDetail lock={lock} />
      ) : aire ? (
        <OfficialAireDetail aire={aire} stretch={aireStretch} status={aireStatus} date={date} />
      ) : (
        obstacle && <ObstacleDetail obstacle={obstacle} />
      )}
    </InfoDialog>
  );
}
