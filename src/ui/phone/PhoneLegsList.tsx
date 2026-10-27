import type { AireWarning } from "@/core/aire";
import type { LegSummary, TripSummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import type { Leg, LegMode } from "@/core/trip";
import { Button } from "../components/Button";
import { ToggleGroup, type ToggleOption } from "../components/ToggleGroup";
import { formatDistance, formatElevation, formatTimeEstimate } from "../format";
import { Icon } from "../icons/Icon";
import { icons, type IconDefinition } from "../icons/icons";
import { strings } from "../strings";
import { AccessStatusLine, AireWarnings, LegAccessView } from "../TripAccessView";

/** Hike / Paddle, icon-only, coloured as the desktop's mode switch: the map's next leg toggle and an open row's switch. */
export const legModeOptions: readonly ToggleOption<LegMode>[] = [
  { value: "hike", label: strings.legModeHike, icon: <Icon icon={icons.hike} />, className: "leg-mode leg-mode-hike" },
  {
    value: "paddle",
    label: strings.legModePaddle,
    icon: <Icon icon={icons.paddle} />,
    className: "leg-mode leg-mode-paddle",
  },
];

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
  /** The open row's leg, if any: only one is open at a time. */
  openLeg: number | null;
  /** A row was tapped. */
  onOpen: (legIndex: number) => void;
  onRetry: (legIndex: number) => void;
  /** The planner switched an open row's leg to another mode. */
  onSetMode: (legIndex: number, mode: LegMode) => void;
};

/**
 * The Legs tab (#121): one row per leg, its mode icon and distance as a headline with the
 * time on the right, and under it the climb and descent (drop on a paddle leg), each after
 * its icon, then the access. The leg's number is only read out. A tapped row opens: its
 * mode switch takes the time's place, the time joins the figures, and the access details,
 * flow figures and aire warnings follow. A leg whose routing failed shows the failure with
 * Retry, open or not.
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
        const [time, ...elevation] = figures(leg);
        return (
          <li key={i} className={`phone-row phone-row-${leg.mode}${open ? " phone-row-open" : ""}`}>
            <div className="phone-row-head">
              <Button className="phone-row-toggle" aria-expanded={open} onClick={() => onOpen(i)}>
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
                  {!open && <FigureView figure={time} className="phone-row-time" />}
                </span>
                {(open || elevation.length > 0) && (
                  <span className="phone-row-figures">
                    {(open ? [time, ...elevation] : elevation).map((figure) => (
                      <FigureView key={figure.key} figure={figure} />
                    ))}
                  </span>
                )}
                {status && <AccessStatusLine state={status} className="phone-row-access" />}
              </Button>
              {open && (
                <ToggleGroup
                  label={strings.legModeLabel(i + 1)}
                  value={leg.mode}
                  options={legModeOptions}
                  onChange={(mode) => onSetMode(i, mode)}
                  className="phone-mode-switch"
                />
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
            {open && (legAccess || warnings.length > 0) && (
              <div className="phone-row-details">
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
