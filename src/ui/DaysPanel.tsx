import type { AireWarning } from "@/core/aire";
import type { DaySummary } from "@/core/summarise";
import type { DayAccess } from "@/core/tripAccess";
import { formatDayDate, formatDistance, formatElevation, formatTimeEstimate } from "./format";
import { strings } from "./strings";
import { AireWarnings, DayAccessView } from "./TripAccessView";

/**
 * Totals for each day (ADR 0008): the trip is split into days at camps.
 * Renders the core's day summaries; no domain logic. A dated trip's days show
 * their calendar dates (#52), and each day its access status and warnings (#58).
 */
export default function DaysPanel({
  days,
  access,
  aire = [],
  onSelectDay,
  heading = true,
}: {
  days: readonly DaySummary[];
  access?: readonly DayAccess[];
  aire?: readonly AireWarning[];
  /** A day card was tapped (the phone zooms the map to that day, #123); desktop rows take no taps. */
  onSelectDay?: (day: number) => void;
  /** False where a tab already names the panel (the phone's Days tab). */
  heading?: boolean;
}) {
  if (days.length === 0) return null;
  return (
    <aside className="days-panel" aria-label={strings.daysPanelLabel}>
      {heading && <h2>{strings.daysPanelLabel}</h2>}
      <ol className="days">
        {days.map((day, i) => (
          <li
            key={i}
            className={onSelectDay ? "day-row day-row-selectable" : "day-row"}
            onClick={onSelectDay && (() => onSelectDay(i))}
          >
            <span className="day-heading">
              {onSelectDay ? (
                // The card takes the tap; this button is the way to it for keyboards and screen readers.
                <button type="button" className="day-label day-select">
                  {strings.dayLabel(i + 1)}
                </button>
              ) : (
                <span className="day-label">{strings.dayLabel(i + 1)}</span>
              )}{" "}
              {day.date && (
                <>
                  <time className="day-date" dateTime={day.date}>
                    {formatDayDate(day.date)}
                  </time>{" "}
                </>
              )}
              <span className="day-legs">{strings.dayLegs(day.firstLeg + 1, day.lastLeg + 1)}</span>
            </span>
            <span>{`${strings.dayHikeDistance} ${formatDistance(day.hikeDistanceKm)}`}</span>
            <span>{`${strings.dayPaddleDistance} ${formatDistance(day.paddleDistanceKm)}`}</span>
            <span>{`${strings.climbLabel} ${formatElevation(day.climbM)}`}</span>
            <span>{`${strings.descentLabel} ${formatElevation(day.descentM)}`}</span>
            <span className="day-time">
              {`${strings.dayTimeEstimate} ${formatTimeEstimate(day.timeH, day.timeStatus)}`}
            </span>
            {access?.[i] && <DayAccessView access={access[i]} />}
            <AireWarnings warnings={aire.filter((warning) => warning.day === i)} showPlace />
          </li>
        ))}
      </ol>
    </aside>
  );
}
