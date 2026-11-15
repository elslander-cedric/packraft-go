import { useId, useMemo } from "react";
import type { SuggestedTrip } from "@/core/suggestedTrips";
import { bankSpotsOf, suggestionAccess } from "@/core/tripFromSuggestion";
import { Button } from "../components/Button";
import { formatDuration, formatElevation, formatShare } from "../format";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import { LegAccessView } from "../TripAccessView";
import {
  localToday,
  useAccessRules,
  useBuiltInLocks,
  useBuiltInObstacles,
  useBuiltInOfficialAires,
} from "../useAccessRules";
import { useOfficialStatus } from "../useOfficialStatus";
import { useWalloonFlows } from "../useWalloonFlows";
import { SuggestionNumber, suggestionFigures } from "./SuggestedTripsList";

const text = strings.planner.suggestedTrips;

export type SuggestedTripDetailsProps = {
  /** Its number in the list and on the map. */
  n: number;
  trip: SuggestedTrip;
  /** The date searched for, YYYY-MM-DD. */
  date: string;
  onBack: () => void;
  onUse: () => void;
};

/**
 * A selected suggestion's details (ADR 0039): its figures, the rivers and aires it uses, and the
 * access of its water on the date with its warnings, as the trip it becomes will show them.
 * Back returns to the list; Use this trip makes it the trip. Both come first, so they show with
 * the sheet at half.
 */
export default function SuggestedTripDetails({
  n,
  trip,
  date,
  onBack,
  onUse,
}: SuggestedTripDetailsProps) {
  const headingId = useId();
  const access = useSuggestionAccess(trip, date);
  const aires = useBuiltInOfficialAires(true)?.aires;
  const aireNames = [
    ...new Set(
      trip.nodes.map(
        (node) => aires?.find((aire) => aire.id === node.id)?.name,
      ),
    ),
  ].filter((name) => name !== undefined);
  const bankSpots = bankSpotsOf(trip).length;
  const rivers = [...new Set(trip.legs.flatMap((leg) => (leg.mode === "paddle" ? leg.waters : [])))];

  return (
    <section
      className="planner-suggested-trip-details"
      aria-labelledby={headingId}
    >
      <div className="planner-suggested-trip-actions">
        <h3 id={headingId}>
          <SuggestionNumber n={n} />
          <span className="visually-hidden">{text.detailsTitle(n)}</span>
        </h3>
        <Button className="planner-button" onClick={onBack}>
          <Icon icon={icons.backToSuggestions} /> {text.back}
        </Button>
        <Button className="planner-button" onClick={onUse}>
          <Icon icon={icons.useSuggestedTrip} /> {text.use}
        </Button>
      </div>
      <p>{suggestionFigures(trip)}</p>
      <p>{`${text.timeLabel}: ${formatDuration(trip.timeH)}`}</p>
      {trip.hikeM > 0 && (
        <>
          <p>{`${text.climbLabel}: ${formatElevation(trip.climbM)} · ${text.descentLabel}: ${formatElevation(trip.descentM)}`}</p>
          <p>{`${text.trailShareLabel}: ${formatShare(trip.trailShare)} · ${text.roadShareLabel}: ${formatShare(trip.roadShare)}`}</p>
        </>
      )}
      {rivers.length > 0 && (
        <p>{`${text.riversLabel}: ${rivers.join(", ")}`}</p>
      )}
      {aireNames.length > 0 && (
        <p>{`${text.airesLabel}: ${aireNames.join(", ")}`}</p>
      )}
      {bankSpots > 0 && <p>{text.bankSpots(bankSpots)}</p>}
      {access?.legs.map(
        (leg) => leg && <LegAccessView key={leg.leg} access={leg} />,
      )}
    </section>
  );
}

/**
 * The access of the suggestion's water on the date, with the obstacles and locks it passes:
 * today's readings for today, as the search used them.
 */
function useSuggestionAccess(trip: SuggestedTrip, date: string) {
  const rules = useAccessRules(true);
  const obstacles = useBuiltInObstacles(true) ?? undefined;
  const locks = useBuiltInLocks(true) ?? undefined;
  const today = localToday();
  const forToday = date === today;
  const flows = useWalloonFlows(rules, forToday);
  const official = useOfficialStatus(rules, forToday);
  return useMemo(
    () =>
      rules &&
      suggestionAccess(trip, date, rules, {
        today,
        ...(flows && { flows }),
        ...(official && { official }),
        locks,
        obstacles,
      }),
    [trip, date, rules, today, flows, official, locks, obstacles],
  );
}
