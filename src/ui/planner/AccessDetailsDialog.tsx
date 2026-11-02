import type { AccessFeature, LockMarker } from "@/core/access";
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
  /** The official aire whose details are open, if any, and its official stretch. */
  aire?: OfficialAire;
  aireStretch?: OfficialStretch;
  /** The obstacle whose details are open, if any. */
  obstacle?: Obstacle;
  /** The incident whose details are open, if any. */
  incident?: Incident;
  /** The date the water's status is for. */
  date: string;
  /** Today's incidents, once asked for: a water's note says if they failed (#216). */
  incidents?: OfficialIncidents;
  onClose: () => void;
};

/** A water's, a lock's, an official aire's, an obstacle's or an incident's details (#125), in a dialog over the map. */
export default function AccessDetailsDialog({
  water,
  lock,
  aire,
  aireStretch,
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
        <OfficialAireDetail aire={aire} stretch={aireStretch} />
      ) : obstacle ? (
        <ObstacleDetail obstacle={obstacle} />
      ) : (
        incident && <IncidentDetail incident={incident} />
      )}
    </InfoDialog>
  );
}
