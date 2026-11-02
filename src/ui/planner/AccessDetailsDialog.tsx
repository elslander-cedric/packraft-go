import type { AccessFeature, AccessStatus, LockMarker } from "@/core/access";
import type { Incident, OfficialIncidents } from "@/core/incident";
import type { Obstacle } from "@/core/obstacle";
import type { OfficialAire, OfficialStretch } from "@/core/officialAire";
import { AccessDetail, IncidentDetail, LockDetail, ObstacleDetail, OfficialAireDetail } from "../AccessPanel";
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
  /** The incident whose details are open, if any. */
  incident?: Incident;
  /** The date the water's or the aire's status is for. */
  date: string;
  /** Today's incidents, once asked for: the note on a water or an aire says if they failed (#216). */
  incidents?: OfficialIncidents;
  onClose: () => void;
};

/** A water's, a lock's, an official aire's, an obstacle's or an incident's details (#125), in a dialog over the map. */
export default function AccessDetailsDialog({
  water,
  lock,
  aire,
  aireStretch,
  aireStatus,
  obstacle,
  incident,
  date,
  incidents,
  onClose,
}: AccessDetailsDialogProps) {
  const obstacleName = obstacle && strings.obstacles.names[obstacle.kind];
  const incidentTitle = incident && strings.incidents.title;
  return (
    <InfoDialog
      open={
        water !== undefined || lock !== undefined || aire !== undefined || obstacle !== undefined || incident !== undefined
      }
      title={water?.record.name ?? lock?.name ?? aire?.name ?? obstacleName ?? incidentTitle ?? ""}
      closeLabel={strings.accessDetailClose}
      onClose={onClose}
    >
      {water ? (
        <AccessDetail feature={water} date={date} {...(incidents && { incidents })} />
      ) : lock ? (
        <LockDetail lock={lock} />
      ) : aire ? (
        <OfficialAireDetail
          aire={aire}
          stretch={aireStretch}
          status={aireStatus}
          date={date}
          {...(incidents && { incidents })}
        />
      ) : obstacle ? (
        <ObstacleDetail obstacle={obstacle} />
      ) : (
        incident && <IncidentDetail incident={incident} />
      )}
    </InfoDialog>
  );
}
