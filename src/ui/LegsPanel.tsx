import type { TripSummary } from "@/core/summarise";
import type { Leg, LegMode } from "@/core/trip";
import { formatDistance, formatElevation } from "./format";
import { strings } from "./strings";

const modeLabel: Record<LegMode, string> = {
  hike: strings.legModeHike,
  paddle: strings.legModePaddle,
};

export type LegsPanelProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  onRetry: (legIndex: number) => void;
};

/** Lists each leg's figures and the trip totals. Renders a summary; no domain logic. */
export default function LegsPanel({ summary, legs, onRetry }: LegsPanelProps) {
  return (
    <aside className="legs-panel" aria-label={strings.legsPanelLabel}>
      <h2>{strings.legsPanelLabel}</h2>
      {summary.legs.length === 0 ? (
        <p className="legs-panel-empty">{strings.legsPanelEmpty}</p>
      ) : (
        <ol className="legs">
          {summary.legs.map((leg, i) => {
            const route = legs[i]?.route;
            return (
              <li key={i} className={`leg-row leg-row-${leg.mode}`}>
                <span>{strings.legLabel(i + 1)}</span>
                <span>{modeLabel[leg.mode]}</span>
                <span>{formatDistance(leg.distanceKm)}</span>
                {leg.climbM !== undefined && <span>{`${strings.climbLabel} ${formatElevation(leg.climbM)}`}</span>}
                {leg.descentM !== undefined && (
                  <span>{`${strings.descentLabel} ${formatElevation(leg.descentM)}`}</span>
                )}
                {(!route || route.status === "pending") && (
                  <span role="status" className="leg-routing">
                    {strings.legRouting}
                  </span>
                )}
                {route?.status === "failed" && (
                  <span className="leg-route-failed">
                    <span role="alert">{strings.legRouteFailed[route.failure.kind]}</span>
                    <button type="button" onClick={() => onRetry(i)}>
                      {strings.retryRouting}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="trip-total">
        {`${strings.tripTotalDistance} ${formatDistance(summary.trip.distanceKm)}`}
      </p>
    </aside>
  );
}
