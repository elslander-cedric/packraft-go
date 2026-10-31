import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import { InfoDialog } from "../components/InfoDialog";
import { formatDistance } from "../format";
import { strings } from "../strings";
import { hasLegDetails, LegDetails } from "./LegDetailsDialog";

export type SectionDetailsDialogProps = {
  /** The section whose details are open, if any. */
  section: number | null;
  summary: TripSummary;
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  onClose: () => void;
};

/**
 * A section's access details in a dialog opened from its row's info button: each leg's
 * details under that leg's number, leaving out legs with none (ADR 0029). Closed while no
 * section is given, or once that section is gone.
 */
export default function SectionDetailsDialog({ section, summary, access, aire, onClose }: SectionDetailsDialogProps) {
  const shown = section === null ? undefined : summary.sections[section];
  const mode = shown?.mode === "paddle" ? strings.legModePaddle : strings.legModeHike;
  const legs = shown
    ? summary.legs.flatMap((_, leg) =>
        leg >= shown.firstLeg && leg <= shown.lastLeg && hasLegDetails(access, aire, leg) ? [leg] : [],
      )
    : [];
  return (
    <InfoDialog
      open={shown !== undefined}
      title={
        section === null || !shown
          ? ""
          : strings.planner.sectionDetailsTitle(section + 1, mode, formatDistance(shown.distanceKm))
      }
      closeLabel={strings.planner.legDetailsClose}
      onClose={onClose}
    >
      <div className="planner-leg-details">
        {legs.map((leg) => (
          <section key={leg} className="planner-leg-details">
            <h3 className="planner-section-details-leg">{strings.legLabel(leg + 1)}</h3>
            <LegDetails leg={leg} access={access} aire={aire} />
          </section>
        ))}
      </div>
    </InfoDialog>
  );
}
