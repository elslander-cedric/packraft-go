import type { NoTripReason, SuggestedTrip } from "@/core/suggestedTrips";
import { Button } from "../components/Button";
import { formatDistance } from "../format";
import { strings } from "../strings";
import type { SuggestionsState } from "./useSuggestedTrips";

const text = strings.planner.suggestedTrips;

/** Why the search found nothing, in words. */
function reasonText(reason: NoTripReason): string {
  switch (reason.kind) {
    case "no-open-water":
      return text.reasons.noOpenWater;
    case "switches":
      return text.reasons.switches(reason.maxSwitches);
    case "shape":
      return reason.shape === "loop" ? text.reasons.loop : text.reasons.oneWay;
    case "paddle-distance":
      return text.reasons.paddleDistance(`${reason.paddleKm} ${strings.kilometreUnit}`);
    case "hike-distance":
      return text.reasons.hikeDistance(`${reason.hikeKm} ${strings.kilometreUnit}`);
  }
}

const waitingText = {
  loading: text.loading,
  waiting: text.waitingForToday,
  failed: text.networkFailed,
} as const;

/** A suggestion's figures on one line, e.g. "Loop · 6.2 km hike · 9.9 km paddle · 2 switches". */
export function suggestionFigures(trip: SuggestedTrip): string {
  return [
    text.shapes[trip.shape],
    ...(trip.hikeM > 0 ? [text.hike(formatDistance(trip.hikeM / 1000))] : []),
    text.paddle(formatDistance(trip.paddleM / 1000)),
    text.switches(trip.switches),
  ].join(" · ");
}

/** A suggestion's number, on a badge like the one on its line. */
export function SuggestionNumber({ n }: { n: number }) {
  return <span className="planner-suggested-trip-number">{n}</span>;
}

/**
 * The suggested trips in the panel or sheet (ADR 0039): one row each, numbered as on the map,
 * with loop or one-way, hike km, paddle km and switches; or why there are none, or what it waits for.
 * A row selects its suggestion.
 */
export default function SuggestedTripsList({
  state,
  onSelect,
}: {
  state: SuggestionsState;
  onSelect: (index: number) => void;
}) {
  if (state.status === "none") {
    return (
      <p role="status" className="planner-empty">
        {reasonText(state.reason)}
      </p>
    );
  }
  if (state.status !== "found") {
    return (
      <p role="status" className="planner-empty">
        {waitingText[state.status]}
      </p>
    );
  }
  return (
    <ol className="planner-suggested-trips" aria-label={text.listLabel}>
      {state.trips.map((trip, i) => (
        <li key={i}>
          <Button className="planner-suggested-trip" onClick={() => onSelect(i)}>
            <SuggestionNumber n={i + 1} />
            <span>{suggestionFigures(trip)}</span>
          </Button>
        </li>
      ))}
    </ol>
  );
}
