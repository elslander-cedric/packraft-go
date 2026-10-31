import type { AireWarning } from "@/core/aire";
import type { SectionSummary } from "@/core/summarise";
import { legsAccess, type TripAccess } from "@/core/tripAccess";
import type { Leg } from "@/core/trip";
import { strings } from "../strings";
import { hasLegDetails } from "./LegDetailsDialog";
import { RoutingFailure, RoutingStatus, TripRow } from "./TripRow";

export type SectionsListProps = {
  sections: readonly SectionSummary[];
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  /** A row was tapped. */
  onSelect: (section: number) => void;
  /** A row's details button was tapped. */
  onShowDetails: (section: number) => void;
  onRetry: (legIndex: number) => void;
  /** The section last tapped, marked by the row's left bar. */
  selected?: number;
};

/**
 * The Sections tab: one row per section (GLOSSARY), like a leg row with the totals of its legs
 * and which legs those are. The warnings and routing state are its legs', gathered (ADR 0029):
 * one "Routing" line while any leg waits, and each failed leg by number with its own Retry.
 */
export default function SectionsList({
  sections,
  legs,
  access,
  aire,
  selected,
  onSelect,
  onShowDetails,
  onRetry,
}: SectionsListProps) {
  if (sections.length === 0) return <p className="planner-empty">{strings.sectionsPanelEmpty}</p>;
  return (
    <ol className="planner-legs" aria-label={strings.sectionsPanelLabel}>
      {sections.map((section, i) => {
        const indices = legs.flatMap((_, leg) => (leg >= section.firstLeg && leg <= section.lastLeg ? [leg] : []));
        const together = access ? legsAccess(access, section) : undefined;
        const routing = indices.some((leg) => !legs[leg].route || legs[leg].route.status === "pending");
        return (
          <TripRow
            key={i}
            row={section}
            label={strings.sectionLabel(i + 1)}
            legs={strings.legRange(section.firstLeg + 1, section.lastLeg + 1)}
            state={together?.state}
            access={together}
            aire={aire.filter((warning) => indices.includes(warning.leg))}
            selected={i === selected}
            onSelect={() => onSelect(i)}
            {...(indices.some((leg) => hasLegDetails(access, aire, leg)) && {
              detailsLabel: strings.planner.sectionDetailsButton(i + 1),
            })}
            onShowDetails={() => onShowDetails(i)}
          >
            {routing && <RoutingStatus />}
            {indices.map((leg) => {
              const route = legs[leg].route;
              return (
                route?.status === "failed" && (
                  <RoutingFailure
                    key={leg}
                    mode={section.mode}
                    failure={route.failure}
                    leg={leg + 1}
                    onRetry={() => onRetry(leg)}
                  />
                )
              );
            })}
          </TripRow>
        );
      })}
    </ol>
  );
}
