import type { AireWarning } from "@/core/aire";
import { dayWarnings } from "@/core/dayWarnings";
import type { DaySummary } from "@/core/summarise";
import type { DayAccess } from "@/core/tripAccess";
import type { ReactNode } from "react";
import { dayDateParts, formatDayDate, formatDistance, formatElevation, formatTimeEstimate } from "./format";
import { Icon } from "./icons/Icon";
import { icons } from "./icons/icons";
import { strings } from "./strings";
import { DayWarningChips } from "./TripAccessView";

/**
 * Totals for each day (ADR 0008): the trip is split into days at camps.
 * Renders the core's day summaries; no domain logic. A dated trip's days show
 * their calendar dates (#52). A day with access, lock or aire warnings shows one chip
 * per leg that has any; the warnings themselves are on the leg, which a chip shows (#58).
 * Where cards take taps (the phone), each card is titled by a calendar tile with its
 * date instead of "Day n", and its figures are shown after icons.
 */
export default function DaysPanel({
  days,
  access,
  aire = [],
  onSelectDay,
  selectedDay,
  heading = true,
  onShowLeg,
}: {
  days: readonly DaySummary[];
  access?: readonly DayAccess[];
  aire?: readonly AireWarning[];
  /** A day card was tapped (the phone zooms the map to that day, #123); desktop rows take no taps. */
  onSelectDay?: (day: number) => void;
  /** The tapped card; none when undefined. */
  selectedDay?: number;
  /** False where a tab already names the panel (the phone's Days tab). */
  heading?: boolean;
  /** A warning chip was tapped: show that leg with its warnings. */
  onShowLeg: (leg: number) => void;
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
              warnings={<DayWarningChips legs={dayWarnings(i, access?.[i], aire)} onShowLeg={onShowLeg} />}
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
              <DayWarningChips legs={dayWarnings(i, access?.[i], aire)} onShowLeg={onShowLeg} />
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

type DayFigureKey = "hike" | "paddle" | "climb" | "descent" | "time";

/** One figure after its icon; the icon's meaning is read out before the value. */
function DayFigure({ figure, value }: { figure: DayFigureKey; value: string | false }) {
  if (!value) return null;
  return (
    <span className={`day-figure day-figure-${figure}`}>
      <Icon icon={icons[figure]} className="day-figure-icon" />
      <span className="visually-hidden">{`${strings.phone.dayFigures[figure]} `}</span>
      {value}
    </span>
  );
}

/**
 * A phone day card: a calendar tile (weekday, day, month) is its title; an undated
 * trip's tile shows "Day" and the day's number. Beside it, like a leg row, the hike and
 * paddle distances as a headline with the time on the right, and under them the climb,
 * descent and legs; a figure that is zero is left out. The card takes the tap and zooms
 * the map to that day (#123); its warning chips take taps of their own.
 */
function PhoneDayCard({
  day,
  index,
  warnings,
  selected,
  onSelect,
}: {
  day: DaySummary;
  index: number;
  warnings: ReactNode;
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
        <div className="day-headline">
          <DayFigure figure="hike" value={day.hikeDistanceKm > 0 && formatDistance(day.hikeDistanceKm)} />
          <DayFigure figure="paddle" value={day.paddleDistanceKm > 0 && formatDistance(day.paddleDistanceKm)} />
          <DayFigure figure="time" value={formatTimeEstimate(day.timeH, day.timeStatus)} />
        </div>
        <div className="day-figures">
          <DayFigure figure="climb" value={Math.round(day.climbM) > 0 && formatElevation(day.climbM)} />
          <DayFigure figure="descent" value={Math.round(day.descentM) > 0 && formatElevation(day.descentM)} />
          <span className="day-legs">{strings.dayLegs(day.firstLeg + 1, day.lastLeg + 1)}</span>
        </div>
        {warnings}
      </div>
    </li>
  );
}
