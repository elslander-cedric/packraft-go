import type { AccessState } from "@/core/access";
import type { AireWarning } from "@/core/aire";
import type { LegRoute } from "@/core/router";
import type { LegSummary } from "@/core/summarise";
import type { AccessSummary } from "@/core/tripAccess";
import type { LegMode } from "@/core/trip";
import type { ReactNode } from "react";
import { Button } from "../components/Button";
import { formatDistance, formatElevation, formatTimeEstimate } from "../format";
import { Icon } from "../icons/Icon";
import { icons, type IconDefinition } from "../icons/icons";
import { strings } from "../strings";
import { LegAccessIcons } from "../TripAccessView";

type Figure = { key: string; icon: IconDefinition; label: string; value: string };

/** A row's time, climb and descent (drop, or rise, on a paddle leg or section) that are known. */
function figures(row: LegSummary): Figure[] {
  const labels = strings.planner.legFigures;
  const all: (Figure | false)[] = [
    { key: "time", icon: icons.time, label: labels.time, value: formatTimeEstimate(row.timeH, row.timeStatus) },
    row.climbM !== undefined && { key: "climb", icon: icons.climb, label: labels.climb, value: formatElevation(row.climbM) },
    row.descentM !== undefined && {
      key: "descent",
      icon: icons.descent,
      label: labels.descent,
      value: formatElevation(row.descentM),
    },
    row.dropM !== undefined && { key: "drop", icon: icons.descent, label: labels.drop, value: formatElevation(row.dropM) },
    row.riseM !== undefined && { key: "rise", icon: icons.climb, label: labels.rise, value: `${formatElevation(row.riseM)}?` },
  ];
  return all.filter((figure): figure is Figure => figure !== false);
}

/** One figure after its icon; the icon's meaning is read out before the value. */
function FigureView({ figure, className }: { figure: Figure; className?: string }) {
  return (
    <span className={className ? `planner-row-figure ${className}` : "planner-row-figure"}>
      <Icon icon={figure.icon} className="planner-row-figure-icon" />
      <span className="visually-hidden">{`${figure.label} `}</span>
      {figure.value}
    </span>
  );
}

export type TripRowProps = {
  /** The leg's or the section's figures. */
  row: LegSummary;
  /** The row's name; only read out. */
  label: string;
  /** Text after the climb and descent: which legs a section covers. */
  legs?: string;
  /** The access status to show; none for a hike row or while it isn't known. */
  state: AccessState | undefined;
  /** Where the warnings' icons come from; a leg's own, or a section's legs' together. */
  access: Pick<AccessSummary, "warnings" | "lockWarnings"> | undefined;
  /** Walloon aire warnings of this row's legs. */
  aire: readonly AireWarning[];
  /** Marked by the row's left bar. */
  selected: boolean;
  /** The row was tapped. */
  onSelect: () => void;
  /** The details button's name; no button without one. */
  detailsLabel?: string;
  onShowDetails: () => void;
  /** The row's routing state. */
  children: ReactNode;
};

/**
 * One row of the Legs or Sections tab (#121): its mode icon and distance as a headline with
 * the time on the right, and under it the climb and descent (drop on a paddle row), each
 * after its icon, then icons for the access and each kind of warning. Rows don't open
 * (#158): a row with access details or aire warnings has an info button beside its access,
 * which shows them in full in a dialog.
 */
export function TripRow({
  row,
  label,
  legs,
  state,
  access,
  aire,
  selected,
  onSelect,
  detailsLabel,
  onShowDetails,
  children,
}: TripRowProps) {
  const [time, ...elevation] = figures(row);
  return (
    <li className={`planner-row planner-row-${row.mode}`}>
      <div className="planner-row-head">
        <Button className="planner-row-toggle" aria-current={selected || undefined} onClick={onSelect}>
          <span className="visually-hidden">{`${label} `}</span>
          <span className="planner-row-headline">
            <FigureView
              figure={{
                key: "distance",
                icon: icons[row.mode],
                label: strings.planner.legFigures[row.mode],
                value: formatDistance(row.distanceKm),
              }}
              className="planner-row-distance"
            />
            <FigureView figure={time} className="planner-row-time" />
          </span>
          {(elevation.length > 0 || legs) && (
            <span className="planner-row-figures">
              {elevation.map((figure) => (
                <FigureView key={figure.key} figure={figure} />
              ))}
              {legs && <span>{legs}</span>}
            </span>
          )}
          <LegAccessIcons state={state} access={access} aire={aire} className="planner-row-access" />
        </Button>
        {detailsLabel && (
          <Button className="planner-row-details-button" aria-label={detailsLabel} onClick={onShowDetails}>
            <Icon icon={icons.legDetails} />
          </Button>
        )}
      </div>
      {children}
    </li>
  );
}

/** A leg's routing state on a row. */
export function RoutingStatus() {
  return (
    <span role="status" className="planner-row-routing">
      {strings.legRouting}
    </span>
  );
}

/** A leg whose routing failed, with Retry. On a section's row `leg` says which one (1-based). */
export function RoutingFailure({
  mode,
  failure,
  leg,
  onRetry,
}: {
  mode: LegMode;
  failure: Extract<LegRoute, { status: "failed" }>["failure"];
  leg?: number;
  onRetry: () => void;
}) {
  const message = mode === "paddle" && failure.kind === "no-route" ? strings.legRouteFailedNoRiver : strings.legRouteFailed[failure.kind];
  return (
    <span className="planner-row-failed">
      <span role="alert">{leg === undefined ? message : strings.planner.sectionLegFailed(leg, message)}</span>
      <Button className="planner-button" onClick={onRetry}>
        {strings.retryRouting}
      </Button>
    </span>
  );
}
