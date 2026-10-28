import type { AireWarning } from "@/core/aire";
import type { LegSummary, TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import type { Leg } from "@/core/trip";
import { Button } from "../components/Button";
import { formatDistance, formatElevation, formatTimeEstimate } from "../format";
import { Icon } from "../icons/Icon";
import { icons, type IconDefinition } from "../icons/icons";
import { strings } from "../strings";
import { AccessStatusLine } from "../TripAccessView";

/** True when a leg has access details or aire warnings to show in its dialog. */
export function hasLegDetails(access: TripAccess | null, aire: readonly AireWarning[], legIndex: number): boolean {
  return access?.legs[legIndex] !== undefined || aire.some((warning) => warning.leg === legIndex);
}

type Figure = { key: string; icon: IconDefinition; label: string; value: string };

/** A leg's time, climb and descent (drop, or rise, on a paddle leg) that are known. */
function figures(leg: LegSummary): Figure[] {
  const labels = strings.phone.legFigures;
  const all: (Figure | false)[] = [
    { key: "time", icon: icons.time, label: labels.time, value: formatTimeEstimate(leg.timeH, leg.timeStatus) },
    leg.climbM !== undefined && { key: "climb", icon: icons.climb, label: labels.climb, value: formatElevation(leg.climbM) },
    leg.descentM !== undefined && {
      key: "descent",
      icon: icons.descent,
      label: labels.descent,
      value: formatElevation(leg.descentM),
    },
    leg.dropM !== undefined && { key: "drop", icon: icons.descent, label: labels.drop, value: formatElevation(leg.dropM) },
    leg.riseM !== undefined && { key: "rise", icon: icons.climb, label: labels.rise, value: `${formatElevation(leg.riseM)}?` },
  ];
  return all.filter((figure): figure is Figure => figure !== false);
}

/** One figure after its icon; the icon's meaning is read out before the value. */
function FigureView({ figure, className }: { figure: Figure; className?: string }) {
  return (
    <span className={className ? `phone-row-figure ${className}` : "phone-row-figure"}>
      <Icon icon={figure.icon} className="phone-row-figure-icon" />
      <span className="visually-hidden">{`${figure.label} `}</span>
      {figure.value}
    </span>
  );
}

export type PhoneLegsListProps = {
  summary: TripSummary;
  /** The trip's legs, for their routing state. */
  legs: readonly Leg[];
  /** Access status per paddle leg; null until the access rules are loaded. */
  access: TripAccess | null;
  /** Walloon aire warnings for the trip's put-ins and take-outs. */
  aire: readonly AireWarning[];
  /** A row was tapped. */
  onSelect: (legIndex: number) => void;
  /** A row's details button was tapped. */
  onShowDetails: (legIndex: number) => void;
  onRetry: (legIndex: number) => void;
};

/**
 * The Legs tab (#121): one row per leg, its mode icon and distance as a headline with the
 * time on the right, and under it the climb and descent (drop on a paddle leg), each after
 * its icon, then the access. The leg's number is only read out. Rows don't open (#158): a
 * row with access details or aire warnings has an info button beside its access line,
 * which shows them in a dialog. A leg's mode is not changed here. A leg whose routing
 * failed shows the failure with Retry.
 */
export default function PhoneLegsList({
  summary,
  legs,
  access,
  aire,
  onSelect,
  onShowDetails,
  onRetry,
}: PhoneLegsListProps) {
  if (summary.legs.length === 0) return <p className="phone-empty">{strings.legsPanelEmpty}</p>;
  return (
    <ol className="phone-legs" aria-label={strings.legsPanelLabel}>
      {summary.legs.map((leg, i) => {
        const route = legs[i]?.route;
        const legAccess = access?.legs[i];
        const status = legAccess?.status.state;
        const [time, ...elevation] = figures(leg);
        return (
          <li key={i} className={`phone-row phone-row-${leg.mode}`}>
            <div className="phone-row-head">
              <Button className="phone-row-toggle" onClick={() => onSelect(i)}>
                <span className="visually-hidden">{`${strings.legLabel(i + 1)} `}</span>
                <span className="phone-row-headline">
                  <FigureView
                    figure={{
                      key: "distance",
                      icon: icons[leg.mode],
                      label: strings.phone.legFigures[leg.mode],
                      value: formatDistance(leg.distanceKm),
                    }}
                    className="phone-row-distance"
                  />
                  <FigureView figure={time} className="phone-row-time" />
                </span>
                {elevation.length > 0 && (
                  <span className="phone-row-figures">
                    {elevation.map((figure) => (
                      <FigureView key={figure.key} figure={figure} />
                    ))}
                  </span>
                )}
                {status && <AccessStatusLine state={status} className="phone-row-access" />}
              </Button>
              {hasLegDetails(access, aire, i) && (
                <Button
                  className="phone-row-details-button"
                  aria-label={strings.phone.legDetailsButton(i + 1)}
                  onClick={() => onShowDetails(i)}
                >
                  <Icon icon={icons.legDetails} />
                </Button>
              )}
            </div>
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
