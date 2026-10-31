import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import { InfoDialog } from "../components/InfoDialog";
import { formatDistance } from "../format";
import { strings } from "../strings";
import { AireWarnings, LegAccessView } from "../TripAccessView";

/** True when a leg has access details or aire warnings to show in a dialog. */
export function hasLegDetails(access: TripAccess | null, aire: readonly AireWarning[], legIndex: number): boolean {
  return access?.legs[legIndex] !== undefined || aire.some((warning) => warning.leg === legIndex);
}

/** A leg's access details: its status, rules, flow figures, warnings and notes, then its aire warnings. */
export function LegDetails({ leg, access, aire }: { leg: number; access: TripAccess | null; aire: readonly AireWarning[] }) {
  const legAccess = access?.legs[leg];
  const warnings = aire.filter((warning) => warning.leg === leg);
  return (
    <>
      {legAccess && <LegAccessView access={legAccess} />}
      {warnings.length > 0 && (
        <div className="leg-access">
          <AireWarnings warnings={warnings} />
        </div>
      )}
    </>
  );
}

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
 * A leg's access details (#158), in a dialog opened from the leg row's info button or
 * a day card's warning chip. Closed while no leg is given, or once that leg is gone.
 */
export default function LegDetailsDialog({ leg, summary, access, aire, onClose }: LegDetailsDialogProps) {
  const legSummary = leg === null ? undefined : summary.legs[leg];
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
      <div className="planner-leg-details">{leg !== null && <LegDetails leg={leg} access={access} aire={aire} />}</div>
    </InfoDialog>
  );
}
