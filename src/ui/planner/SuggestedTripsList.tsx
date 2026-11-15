import type { NoTripReason } from "@/core/suggestedTrips";
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
  }
}

const waitingText = {
  loading: text.loading,
  waiting: text.waitingForToday,
  failed: text.networkFailed,
} as const;

/**
 * The suggested trips in the panel or sheet (ADR 0039): one row each, numbered as on the map,
 * with loop or one-way, paddle km and switches; or why there are none, or what it waits for.
 */
export default function SuggestedTripsList({ state }: { state: SuggestionsState }) {
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
        <li key={i} className="planner-suggested-trip">
          <span className="planner-suggested-trip-number">{i + 1}</span>
          <span>
            {[
              text.shapes[trip.shape],
              text.paddle(formatDistance(trip.paddleM / 1000)),
              text.switches(trip.switches),
            ].join(" · ")}
          </span>
        </li>
      ))}
    </ol>
  );
}
