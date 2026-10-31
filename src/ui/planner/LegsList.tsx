import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import type { Leg } from "@/core/trip";
import { strings } from "../strings";
import { hasLegDetails } from "./LegDetailsDialog";
import { RoutingFailure, RoutingStatus, TripRow } from "./TripRow";

export type LegsListProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  /** A row was tapped. */
  onSelect: (legIndex: number) => void;
  /** A row's details button was tapped. */
  onShowDetails: (legIndex: number) => void;
  onRetry: (legIndex: number) => void;
  /** The leg last tapped, marked by the row's left bar. */
  selected?: number;
};

/**
 * The Legs tab (#121): one row per leg. The leg's number is only read out. A leg's mode is
 * not changed here. A leg whose routing failed shows the failure with Retry.
 */
export default function LegsList({
  summary,
  legs,
  access,
  aire,
  selected,
  onSelect,
  onShowDetails,
  onRetry,
}: LegsListProps) {
  if (summary.legs.length === 0) return <p className="planner-empty">{strings.legsPanelEmpty}</p>;
  return (
    <ol className="planner-legs" aria-label={strings.legsPanelLabel}>
      {summary.legs.map((leg, i) => {
        const route = legs[i]?.route;
        const legAccess = access?.legs[i];
        return (
          <TripRow
            key={i}
            row={leg}
            label={strings.legLabel(i + 1)}
            state={legAccess?.status.state}
            access={legAccess}
            aire={aire.filter((warning) => warning.leg === i)}
            selected={i === selected}
            onSelect={() => onSelect(i)}
            {...(hasLegDetails(access, aire, i) && { detailsLabel: strings.planner.legDetailsButton(i + 1) })}
            onShowDetails={() => onShowDetails(i)}
          >
            {(!route || route.status === "pending") && <RoutingStatus />}
            {route?.status === "failed" && (
              <RoutingFailure mode={leg.mode} failure={route.failure} onRetry={() => onRetry(i)} />
            )}
          </TripRow>
        );
      })}
    </ol>
  );
}
