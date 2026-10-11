import type { TripSummary } from "@/core/summarise";
import type { Leg, LegMode } from "@/core/trip";
import { formatDistance, formatDuration, formatElevation } from "./format";
import { strings } from "./strings";

const modes: readonly LegMode[] = ["hike", "paddle"];

const modeLabel: Record<LegMode, string> = {
  hike: strings.legModeHike,
  paddle: strings.legModePaddle,
};

export type LegsPanelProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  onRetry: (legIndex: number) => void;
  /** The planner switched a leg to another mode. */
  onSetMode: (legIndex: number, mode: LegMode) => void;
};

type ModeSwitchProps = { legIndex: number; mode: LegMode; onSetMode: (mode: LegMode) => void };

/** Hike / Paddle switch for one leg; the leg's current mode is pressed. */
function ModeSwitch({ legIndex, mode, onSetMode }: ModeSwitchProps) {
  return (
    <span role="group" aria-label={strings.legModeLabel(legIndex + 1)} className="leg-mode-switch">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          className={`leg-mode leg-mode-${m}`}
          aria-pressed={m === mode}
          onClick={() => onSetMode(m)}
        >
          {modeLabel[m]}
        </button>
      ))}
    </span>
  );
}

/** Lists each leg's figures and the trip totals. Renders a summary; no domain logic. */
export default function LegsPanel({ summary, legs, onRetry, onSetMode }: LegsPanelProps) {
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
                <ModeSwitch legIndex={i} mode={leg.mode} onSetMode={(mode) => onSetMode(i, mode)} />
                <span>{formatDistance(leg.distanceKm)}</span>
                {leg.climbM !== undefined && <span>{`${strings.climbLabel} ${formatElevation(leg.climbM)}`}</span>}
                {leg.descentM !== undefined && (
                  <span>{`${strings.descentLabel} ${formatElevation(leg.descentM)}`}</span>
                )}
                {leg.dropM !== undefined && <span>{`${strings.dropLabel} ${formatElevation(leg.dropM)}`}</span>}
                {leg.riseM !== undefined && <span>{strings.riseFigure(formatElevation(leg.riseM))}</span>}
                <span className="leg-time">{`${strings.legTimeEstimate} ${formatDuration(leg.timeH)}`}</span>
                {(!route || route.status === "pending") && (
                  <span role="status" className="leg-routing">
                    {strings.legRouting}
                  </span>
                )}
                {route?.status === "failed" && (
                  <span className="leg-route-failed">
                    <span role="alert">
                      {leg.mode === "paddle" && route.failure.kind === "no-route"
                        ? strings.legRouteFailedNoRiver
                        : strings.legRouteFailed[route.failure.kind]}
                    </span>
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
      <p className="trip-time">{`${strings.tripTotalTimeEstimate} ${formatDuration(summary.trip.timeH)}`}</p>
      <p className="time-estimate-note">{strings.timeEstimateNote}</p>
    </aside>
  );
}
