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
 * Renders the core's day summaries; no domain logic. Each day is a card titled by a
 * calendar tile with its date (#52), its figures shown after icons. A day with access,
 * lock or aire warnings shows one chip per leg that has any; the warnings themselves
 * are on the leg, which a chip shows (#58).
 */
export default function DaysPanel({
  days,
  access,
  aire = [],
  onSelectDay,
  selectedDay,
  onShowLeg,
}: {
  days: readonly DaySummary[];
  access?: readonly DayAccess[];
  aire?: readonly AireWarning[];
  /** A day card was tapped: the planner zooms the map to that day (#123). */
  onSelectDay: (day: number) => void;
  /** The tapped card; none when undefined. */
  selectedDay?: number;
  /** A warning chip was tapped: show that leg with its warnings. */
  onShowLeg: (leg: number) => void;
}) {
  if (days.length === 0) return null;
  // The Days tab names the panel: it needs no heading of its own.
  return (
    <aside className="days-panel" aria-label={strings.daysPanelLabel}>
      <ol className="days">
        {days.map((day, i) => (
          <DayCard
            key={i}
            day={day}
            index={i}
            warnings={<DayWarningChips legs={dayWarnings(i, access?.[i], aire)} onShowLeg={onShowLeg} />}
            selected={i === selectedDay}
            onSelect={() => onSelectDay(i)}
          />
        ))}
      </ol>
    </aside>
  );
}

type DayFigureKey = "hike" | "paddle" | "climb" | "descent" | "time";

/** One figure after its icon; the icon's meaning is read out before the value. */
function DayFigure({ figure, value }: { figure: DayFigureKey; value: string | false }) {
  if (!value) return null;
  return (
    <span className={`day-figure day-figure-${figure}`}>
      <Icon icon={icons[figure]} className="day-figure-icon" />
      <span className="visually-hidden">{`${strings.planner.dayFigures[figure]} `}</span>
      {value}
    </span>
  );
}

/**
 * A day card: a calendar tile (weekday, day, month) is its title; an undated
 * trip's tile shows "Day" and the day's number. Beside it, like a leg row, the hike and
 * paddle distances as a headline with the time on the right, and under them the climb,
 * descent and legs; a figure that is zero is left out. The card takes the tap and zooms
 * the map to that day (#123); its warning chips take taps of their own.
 */
function DayCard({
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
          <span className="day-legs">{strings.legRange(day.firstLeg + 1, day.lastLeg + 1)}</span>
        </div>
        {warnings}
      </div>
    </li>
  );
}
