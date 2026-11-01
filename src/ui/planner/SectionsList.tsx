import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import { legsAccess, type TripAccess } from "@/core/tripAccess";
import type { Leg } from "@/core/trip";
import { useId } from "react";
import { strings } from "../strings";
import { hasLegDetails } from "./LegDetailsDialog";
import { RoutingFailure, RoutingStatus, TripRow } from "./TripRow";

export type SectionsListProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  /** A section's row was tapped. */
  onSelect: (section: number) => void;
  /** A leg's row was tapped. */
  onSelectLeg: (legIndex: number) => void;
  /** A row's details button was tapped. */
  onShowDetails: (section: number) => void;
  onRetry: (legIndex: number) => void;
  /** The section last tapped, marked by the row's left bar. */
  selected?: number;
  /** The leg last tapped, marked the same way; a tap on a section or a leg clears the other. */
  selectedLeg?: number;
  /** The first legs of the sections whose legs are shown. */
  open: readonly number[];
  /** A section's button showed or hid its legs. */
  onToggle: (firstLeg: number) => void;
};

/**
 * The Sections tab: one row per section (GLOSSARY), like a leg row with the totals of its legs
 * and which legs those are. The warnings and routing state are its legs', gathered (ADR 0029):
 * one "Routing" line while any leg waits, and each failed leg, by number when there are several, with its own Retry.
 * A section of several legs can show them under it: figures, access and warning icons, and a
 * tap that zooms to the leg. Retry and the details stay on the section.
 */
export default function SectionsList({
  summary,
  legs,
  access,
  aire,
  selected,
  selectedLeg,
  open,
  onSelect,
  onSelectLeg,
  onToggle,
  onShowDetails,
  onRetry,
}: SectionsListProps) {
  const listId = useId();
  const { sections } = summary;
  if (sections.length === 0) return <p className="planner-empty">{strings.sectionsPanelEmpty}</p>;
  return (
    <ol className="planner-legs" aria-label={strings.sectionsPanelLabel}>
      {sections.map((section, i) => {
        const indices = legs.flatMap((_, leg) => (leg >= section.firstLeg && leg <= section.lastLeg ? [leg] : []));
        const together = access ? legsAccess(access, section) : undefined;
        const routing = indices.some((leg) => !legs[leg].route || legs[leg].route.status === "pending");
        const legsLabel = strings.planner.sectionLegs(i + 1);
        const legsId = `${listId}-${i}`;
        const legsOpen = open.includes(section.firstLeg);
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
            {...(indices.length > 1 && {
              expand: {
                label: legsLabel,
                open: legsOpen,
                controls: legsId,
                onToggle: () => onToggle(section.firstLeg),
              },
            })}
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
                    {...(indices.length > 1 && { leg: leg + 1 })}
                    onRetry={() => onRetry(leg)}
                  />
                )
              );
            })}
            {indices.length > 1 && legsOpen && (
              <ol id={legsId} className="planner-section-legs" aria-label={legsLabel}>
                {indices.map((leg) => (
                  <TripRow
                    key={leg}
                    row={summary.legs[leg]}
                    label={strings.legLabel(leg + 1)}
                    legs={strings.legRange(leg + 1, leg + 1)}
                    state={access?.legs[leg]?.status.state}
                    access={access?.legs[leg]}
                    aire={aire.filter((warning) => warning.leg === leg)}
                    selected={leg === selectedLeg}
                    onSelect={() => onSelectLeg(leg)}
                  />
                ))}
              </ol>
            )}
          </TripRow>
        );
      })}
    </ol>
  );
}
