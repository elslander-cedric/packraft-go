import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import { InfoDialog } from "../components/InfoDialog";
import { formatDistance } from "../format";
import { strings } from "../strings";
import { AireWarnings, LegAccessView } from "../TripAccessView";

export type LegDetailsDialogProps = {
  /** The leg whose details are open, if any. */
  leg: number | null;
  summary: TripSummary;
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  onClose: () => void;
};

/**
 * A leg's access details (#158): its status, rules, flow figures, warnings
 * and notes, then its aire warnings, in a dialog opened from the leg row's info button or
 * a day card's warning chip. Closed while no leg is given, or once that leg is gone.
 */
export default function LegDetailsDialog({ leg, summary, access, aire, onClose }: LegDetailsDialogProps) {
  const legSummary = leg === null ? undefined : summary.legs[leg];
  const legAccess = leg === null ? undefined : access?.legs[leg];
  const warnings = aire.filter((warning) => warning.leg === leg);
  const mode = legSummary?.mode === "paddle" ? strings.legModePaddle : strings.legModeHike;
  return (
    <InfoDialog
      open={leg !== null && legSummary !== undefined}
      title={
        leg === null || !legSummary
          ? ""
          : strings.planner.legDetailsTitle(leg + 1, mode, formatDistance(legSummary.distanceKm))
      }
      closeLabel={strings.planner.legDetailsClose}
      onClose={onClose}
    >
      <div className="planner-leg-details">
        {legAccess && <LegAccessView access={legAccess} />}
        {warnings.length > 0 && (
          <div className="leg-access">
            <AireWarnings warnings={warnings} />
          </div>
        )}
      </div>
    </InfoDialog>
  );
}
