import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import type { Leg } from "@/core/trip";
import { Button } from "../components/Button";
import { formatDistance, formatTimeEstimate } from "../format";
import { strings } from "../strings";

const modeLabel = { hike: strings.legModeHike, paddle: strings.legModePaddle } as const;

export type PhoneLegsListProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  onRetry: (legIndex: number) => void;
};

/** The Legs tab: one compact row per leg with its mode, distance, time and access. */
export default function PhoneLegsList({ summary, legs, access, onRetry }: PhoneLegsListProps) {
  if (summary.legs.length === 0) return <p className="phone-empty">{strings.legsPanelEmpty}</p>;
  return (
    <ol className="phone-legs" aria-label={strings.legsPanelLabel}>
      {summary.legs.map((leg, i) => {
        const route = legs[i]?.route;
        const status = access?.legs[i]?.status.state;
        return (
          <li key={i} className={`phone-row phone-row-${leg.mode}`}>
            <span className="phone-row-name">{strings.legLabel(i + 1)}</span>
            <span className="phone-row-mode">{modeLabel[leg.mode]}</span>
            <span className="phone-row-figure">{formatDistance(leg.distanceKm)}</span>
            <span className="phone-row-figure">{formatTimeEstimate(leg.timeH, leg.timeStatus)}</span>
            {status && (
              <span className={`phone-row-access access-status-${status}`}>
                <span className="visually-hidden">{`${strings.phone.legAccessLabel}: `}</span>
                {status === "checking" ? strings.accessChecking : strings.accessState[status]}
              </span>
            )}
            {(!route || route.status === "pending") && (
              <span role="status" className="phone-row-routing">
                {strings.legRouting}
              </span>
            )}
            {route?.status === "failed" && (
              <span className="phone-row-failed">
                <span role="alert">
                  {leg.mode === "paddle" && route.failure.kind === "no-route"
                    ? strings.legRouteFailedNoRiver
                    : strings.legRouteFailed[route.failure.kind]}
                </span>
                <Button className="phone-button" onClick={() => onRetry(i)}>
                  {strings.retryRouting}
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
