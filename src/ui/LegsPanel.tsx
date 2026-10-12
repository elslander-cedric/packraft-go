import type { TripSummary } from "@/core/summarise";
import type { Leg, LegMode } from "@/core/trip";
import { Button } from "./components/Button";
import { ToggleGroup, type ToggleOption } from "./components/ToggleGroup";
import { formatDistance, formatElevation, formatTimeEstimate } from "./format";
import { strings } from "./strings";

const modes: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, className: "leg-mode leg-mode-hike" },
  { value: "paddle", label: strings.legModePaddle, className: "leg-mode leg-mode-paddle" },
];

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
    <ToggleGroup
      label={strings.legModeLabel(legIndex + 1)}
      value={mode}
      options={modes}
      onChange={onSetMode}
      className="leg-mode-switch"
    />
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
                <div className="leg-row-heading">
                  <span className="leg-name">{strings.legLabel(i + 1)}</span>
                  <ModeSwitch legIndex={i} mode={leg.mode} onSetMode={(mode) => onSetMode(i, mode)} />
                  <span className="leg-figure leg-distance">{formatDistance(leg.distanceKm)}</span>
                </div>
                <div className="leg-figures">
                  {leg.climbM !== undefined && (
                    <span className="leg-figure">{`${strings.climbLabel} ${formatElevation(leg.climbM)}`}</span>
                  )}
                  {leg.descentM !== undefined && (
                    <span className="leg-figure">{`${strings.descentLabel} ${formatElevation(leg.descentM)}`}</span>
                  )}
                  {leg.dropM !== undefined && (
                    <span className="leg-figure">{`${strings.dropLabel} ${formatElevation(leg.dropM)}`}</span>
                  )}
                  {leg.riseM !== undefined && (
                    <span className="leg-figure">{strings.riseFigure(formatElevation(leg.riseM))}</span>
                  )}
                  <span className="leg-figure leg-time">
                    {`${strings.legTimeEstimate} ${formatTimeEstimate(leg.timeH, leg.timeStatus)}`}
                  </span>
                </div>
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
                    <Button onClick={() => onRetry(i)}>{strings.retryRouting}</Button>
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
      <p className="trip-time">
        {`${strings.tripTotalTimeEstimate} ${formatTimeEstimate(summary.trip.timeH, summary.trip.timeStatus)}`}
      </p>
      <p className="time-estimate-note">{strings.timeEstimateNote}</p>
    </aside>
  );
}
