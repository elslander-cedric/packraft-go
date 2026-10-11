import type { DaySummary } from "@/core/summarise";
import { formatDistance, formatElevation, formatTimeEstimate } from "./format";
import { strings } from "./strings";

/**
 * Totals for each day (ADR 0008): the trip is split into days at camps.
 * Renders the core's day summaries; no domain logic.
 */
export default function DaysPanel({ days }: { days: readonly DaySummary[] }) {
  if (days.length === 0) return null;
  return (
    <aside className="days-panel" aria-label={strings.daysPanelLabel}>
      <h2>{strings.daysPanelLabel}</h2>
      <ol className="days">
        {days.map((day, i) => (
          <li key={i} className="day-row">
            <span className="day-heading">
              <span className="day-label">{strings.dayLabel(i + 1)}</span>{" "}
              <span className="day-legs">{strings.dayLegs(day.firstLeg + 1, day.lastLeg + 1)}</span>
            </span>
            <span>{`${strings.dayHikeDistance} ${formatDistance(day.hikeDistanceKm)}`}</span>
            <span>{`${strings.dayPaddleDistance} ${formatDistance(day.paddleDistanceKm)}`}</span>
            <span>{`${strings.climbLabel} ${formatElevation(day.climbM)}`}</span>
            <span>{`${strings.descentLabel} ${formatElevation(day.descentM)}`}</span>
            <span className="day-time">
              {`${strings.dayTimeEstimate} ${formatTimeEstimate(day.timeH, day.timeStatus)}`}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
