import type { AireWarning } from "@/core/aire";
import type { TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import type { Leg, LegMode } from "@/core/trip";
import { Button } from "../components/Button";
import { ToggleGroup, type ToggleOption } from "../components/ToggleGroup";
import { formatDistance, formatElevation, formatTimeEstimate } from "../format";
import { strings } from "../strings";
import { AccessStatusLine, AireWarnings, LegAccessView } from "../TripAccessView";

const modeLabel = { hike: strings.legModeHike, paddle: strings.legModePaddle } as const;

/** Hike / Paddle, styled as the desktop's mode switch. */
export const legModeOptions: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, className: "leg-mode leg-mode-hike" },
  { value: "paddle", label: strings.legModePaddle, className: "leg-mode leg-mode-paddle" },
];

export type PhoneLegsListProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  /** The open row's leg, if any: only one is open at a time. */
  openLeg: number | null;
  /** A row was tapped. */
  onOpen: (legIndex: number) => void;
  onRetry: (legIndex: number) => void;
  /** The planner switched an open row's leg to another mode. */
  onSetMode: (legIndex: number, mode: LegMode) => void;
};

/**
 * The Legs tab (#121): one compact row per leg with its mode, distance, time and
 * access. A tapped row opens with the leg's climb and descent (drop on a paddle
 * leg), its mode switch, access details, flow figures and aire warnings. A leg
 * whose routing failed shows the failure with Retry, open or not.
 */
export default function PhoneLegsList({
  summary,
  legs,
  access,
  aire,
  openLeg,
  onOpen,
  onRetry,
  onSetMode,
}: PhoneLegsListProps) {
  if (summary.legs.length === 0) return <p className="phone-empty">{strings.legsPanelEmpty}</p>;
  return (
    <ol className="phone-legs" aria-label={strings.legsPanelLabel}>
      {summary.legs.map((leg, i) => {
        const route = legs[i]?.route;
        const legAccess = access?.legs[i];
        const status = legAccess?.status.state;
        const open = i === openLeg;
        const warnings = aire.filter((warning) => warning.leg === i);
        return (
          <li key={i} className={`phone-row phone-row-${leg.mode}`}>
            <Button className="phone-row-toggle" aria-expanded={open} onClick={() => onOpen(i)}>
              <span className="phone-row-name">{strings.legLabel(i + 1)}</span>
              <span className="phone-row-mode">{modeLabel[leg.mode]}</span>
              <span className="phone-row-figure">{formatDistance(leg.distanceKm)}</span>
              <span className="phone-row-figure">{formatTimeEstimate(leg.timeH, leg.timeStatus)}</span>
              {status && <AccessStatusLine state={status} className="phone-row-access" />}
            </Button>
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
            {open && (
              <div className="phone-row-details">
                <ToggleGroup
                  label={strings.legModeLabel(i + 1)}
                  value={leg.mode}
                  options={legModeOptions}
                  onChange={(mode) => onSetMode(i, mode)}
                  className="leg-mode-switch phone-mode-switch"
                />
                <div className="phone-row-figures">
                  {leg.climbM !== undefined && (
                    <span className="phone-row-figure">{`${strings.climbLabel} ${formatElevation(leg.climbM)}`}</span>
                  )}
                  {leg.descentM !== undefined && (
                    <span className="phone-row-figure">{`${strings.descentLabel} ${formatElevation(leg.descentM)}`}</span>
                  )}
                  {leg.dropM !== undefined && (
                    <span className="phone-row-figure">{`${strings.dropLabel} ${formatElevation(leg.dropM)}`}</span>
                  )}
                  {leg.riseM !== undefined && (
                    <span className="phone-row-figure">{strings.riseFigure(formatElevation(leg.riseM))}</span>
                  )}
                </div>
                {legAccess && <LegAccessView access={legAccess} />}
                {warnings.length > 0 && (
                  <div className="leg-access">
                    <AireWarnings warnings={warnings} />
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
