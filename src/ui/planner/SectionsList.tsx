import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import { legsAccess, type TripAccess } from "@/core/tripAccess";
import type { Leg } from "@/core/trip";
import { useEffect, useRef } from "react";
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
  /** A section's details button was tapped. */
  onShowDetails: (section: number) => void;
  /** A leg's details button was tapped. */
  onShowLegDetails: (legIndex: number) => void;
  onRetry: (legIndex: number) => void;
  /** The section last tapped, marked by the row's left bar. */
  selected?: number;
  /** The leg last tapped, marked the same way; a tap on a section or a leg clears the other. */
  selectedLeg?: number;
  /** The first legs of the sections whose legs are shown. */
  open: readonly number[];
};

/**
 * The Sections tab: one row per section (GLOSSARY), like a leg row with the totals of its legs
 * and which legs those are. The warnings and routing state are its legs', gathered (ADR 0029):
 * one "Routing" line while any leg waits, and each failed leg, by number when there are several, with its own Retry.
 * A tap on the selected section of several legs shows them under it (#200): figures, access and
 * warning icons, a tap that zooms to the leg and a button to its own details. Retry stays on the
 * section.
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
  onShowDetails,
  onShowLegDetails,
  onRetry,
}: SectionsListProps) {
  const list = useRef<HTMLOListElement>(null);
  const { sections } = summary;

  // Keep the row just tapped in view, with what it opened: the tap lowers a raised sheet.
  useEffect(() => {
    list.current?.querySelector("[aria-current]")?.closest("li")?.scrollIntoView?.({ block: "nearest" });
  }, [selected, selectedLeg, open]);

  if (sections.length === 0) return <p className="planner-empty">{strings.sectionsPanelEmpty}</p>;
  return (
    <ol ref={list} className="planner-legs" aria-label={strings.sectionsPanelLabel}>
      {sections.map((section, i) => {
        const indices = legs.flatMap((_, leg) => (leg >= section.firstLeg && leg <= section.lastLeg ? [leg] : []));
        const together = access ? legsAccess(access, section) : undefined;
        const routing = indices.some((leg) => !legs[leg].route || legs[leg].route.status === "pending");
        const legsLabel = strings.planner.sectionLegs(i + 1);
        const legsOpen = open.includes(section.firstLeg);
        const failed = indices.filter((leg) => legs[leg].route?.status === "failed");
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
            {...(indices.length > 1 && { open: legsOpen })}
            {...(indices.some((leg) => hasLegDetails(access, aire, leg)) && {
              details: { label: strings.planner.sectionDetailsButton(i + 1), onShow: () => onShowDetails(i) },
            })}
            {...((routing || failed.length > 0) && {
              status: (
                <>
                  {routing && <RoutingStatus />}
                  {failed.map((leg) => {
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
                </>
              ),
            })}
          >
            {indices.length > 1 && legsOpen && (
              <ol className="planner-section-legs" aria-label={legsLabel}>
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
                    {...(hasLegDetails(access, aire, leg) && {
                      details: { label: strings.planner.legDetailsButton(leg + 1), onShow: () => onShowLegDetails(leg) },
                    })}
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
