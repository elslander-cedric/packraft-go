import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import type { Leg, LegMode } from "@/core/trip";
import { useRef } from "react";
import { Button } from "./components/Button";
import { ToggleGroup, type ToggleOption } from "./components/ToggleGroup";
import { formatDistance, formatElevation, formatTimeEstimate } from "./format";
import { useScrollToShownLeg, type ShownLeg } from "./shownLeg";
import { strings } from "./strings";
import { AireWarnings, LegAccessView } from "./TripAccessView";

const modes: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, className: "leg-mode leg-mode-hike" },
  { value: "paddle", label: strings.legModePaddle, className: "leg-mode leg-mode-paddle" },
];

export type LegsPanelProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status and warnings per paddle leg (#58); null until the access rules are loaded. */
  access?: TripAccess | null;
  /** Walloon aire warnings (#62) for the trip's put-ins and take-outs. */
  aire?: readonly AireWarning[];
  onRetry: (legIndex: number) => void;
  /** The planner switched a leg to another mode. */
  onSetMode: (legIndex: number, mode: LegMode) => void;
  /** The leg a day row's warning chip asked to show: scrolled to and briefly highlighted. */
  shownLeg?: ShownLeg | null;
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
export default function LegsPanel({ summary, legs, access, aire = [], onRetry, onSetMode, shownLeg = null }: LegsPanelProps) {
  const list = useRef<HTMLOListElement>(null);
  useScrollToShownLeg(list, shownLeg);
  return (
    <aside className="legs-panel" aria-label={strings.legsPanelLabel}>
      <h2>{strings.legsPanelLabel}</h2>
      {summary.legs.length === 0 ? (
        <p className="legs-panel-empty">{strings.legsPanelEmpty}</p>
      ) : (
        <ol ref={list} className="legs">
          {summary.legs.map((leg, i) => {
            const route = legs[i]?.route;
            const shown = shownLeg?.leg === i;
            return (
              // A new key per request replays the highlight when the same leg is shown again.
              <li key={shown ? `${i}:${shownLeg.seq}` : i} className={`leg-row leg-row-${leg.mode}${shown ? " leg-row-shown" : ""}`}>
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
                {access?.legs[i] && <LegAccessView access={access.legs[i]} />}
                {aire.some((warning) => warning.leg === i) && (
                  // Like the leg's access status, in its own block apart from the figures.
                  <div className="leg-access">
                    <AireWarnings warnings={aire.filter((warning) => warning.leg === i)} />
                  </div>
                )}
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
