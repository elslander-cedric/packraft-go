import type { AireWarning } from "@/core/aire";
import type { DaySummary } from "@/core/summarise";
import type { DayAccess } from "@/core/tripAccess";
import { dayDateParts, formatDayDate, formatDistance, formatElevation, formatTimeEstimate } from "./format";
import { strings } from "./strings";
import { AireWarnings, DayAccessView } from "./TripAccessView";

/**
 * Totals for each day (ADR 0008): the trip is split into days at camps.
 * Renders the core's day summaries; no domain logic. A dated trip's days show
 * their calendar dates (#52), and each day its access status and warnings (#58).
 * Where cards take taps (the phone), only the selected card shows the warnings, and
 * each card is titled by a calendar tile with its date instead of "Day n".
 */
export default function DaysPanel({
  days,
  access,
  aire = [],
  onSelectDay,
  selectedDay,
  heading = true,
}: {
  days: readonly DaySummary[];
  access?: readonly DayAccess[];
  aire?: readonly AireWarning[];
  /** A day card was tapped (the phone zooms the map to that day, #123); desktop rows take no taps. */
  onSelectDay?: (day: number) => void;
  /** The tapped card, which alone shows its access warnings; none when undefined. */
  selectedDay?: number;
  /** False where a tab already names the panel (the phone's Days tab). */
  heading?: boolean;
}) {
  if (days.length === 0) return null;
  return (
    <aside className="days-panel" aria-label={strings.daysPanelLabel}>
      {heading && <h2>{strings.daysPanelLabel}</h2>}
      <ol className="days">
        {days.map((day, i) =>
          onSelectDay ? (
            <PhoneDayCard
              key={i}
              day={day}
              index={i}
              access={access?.[i]}
              aire={aire}
              selected={i === selectedDay}
              onSelect={() => onSelectDay(i)}
            />
          ) : (
            <li key={i} className="day-row">
              <span className="day-heading">
                <span className="day-label">{strings.dayLabel(i + 1)}</span>{" "}
                {day.date && (
                  <>
                    <time className="day-date" dateTime={day.date}>
                      {formatDayDate(day.date)}
                    </time>{" "}
                  </>
                )}
                <span className="day-legs">{strings.dayLegs(day.firstLeg + 1, day.lastLeg + 1)}</span>
              </span>
              <DayFigures day={day} />
              {access?.[i] && <DayAccessView access={access[i]} details />}
              <AireWarnings warnings={aire.filter((warning) => warning.day === i)} showPlace />
            </li>
          ),
        )}
      </ol>
    </aside>
  );
}

function DayFigures({ day }: { day: DaySummary }) {
  return (
    <>
      <span>{`${strings.dayHikeDistance} ${formatDistance(day.hikeDistanceKm)}`}</span>
      <span>{`${strings.dayPaddleDistance} ${formatDistance(day.paddleDistanceKm)}`}</span>
      <span>{`${strings.climbLabel} ${formatElevation(day.climbM)}`}</span>
      <span>{`${strings.descentLabel} ${formatElevation(day.descentM)}`}</span>
      <span className="day-time">{`${strings.dayTimeEstimate} ${formatTimeEstimate(day.timeH, day.timeStatus)}`}</span>
    </>
  );
}

/**
 * A phone day card: a calendar tile (weekday, day, month) is its title; an undated
 * trip's tile shows "Day" and the day's number. The card takes the tap and zooms the
 * map to that day (#123); only the selected card shows its warnings.
 */
function PhoneDayCard({
  day,
  index,
  access,
  aire,
  selected,
  onSelect,
}: {
  day: DaySummary;
  index: number;
  access?: DayAccess;
  aire: readonly AireWarning[];
  selected: boolean;
  onSelect: () => void;
}) {
  const date = day.date && dayDateParts(day.date);
  return (
    <li className={`day-row day-card${selected ? " day-row-selected" : ""}`} onClick={onSelect}>
      {/* The card takes the tap; the tile is the way to it for keyboards and screen readers. */}
      <button
        type="button"
        className="day-tile"
        aria-expanded={selected}
        aria-label={day.date ? formatDayDate(day.date) : strings.dayLabel(index + 1)}
      >
        {date ? (
          <time dateTime={day.date}>
            <span className="day-tile-small">{date.weekday}</span>
            <span className="day-tile-number">{date.day}</span>
            <span className="day-tile-small">{date.month}</span>
          </time>
        ) : (
          <>
            <span className="day-tile-small">{strings.dayTileWord}</span>
            <span className="day-tile-number">{index + 1}</span>
          </>
        )}
      </button>
      <div className="day-card-body">
        <span className="day-legs">{strings.dayLegs(day.firstLeg + 1, day.lastLeg + 1)}</span>
        <div className="day-figures">
          <DayFigures day={day} />
        </div>
        {access && <DayAccessView access={access} details={selected} />}
        {selected && <AireWarnings warnings={aire.filter((warning) => warning.day === index)} showPlace />}
      </div>
    </li>
  );
}
