import type { AireWarning } from "@/core/aire";
import type { DaySummary } from "@/core/summarise";
import type { TripAccess } from "@/core/tripAccess";
import { Button } from "../components/Button";
import { formatDayDate } from "../format";
import { accessStateLabel, strings } from "../strings";
import { TripAccessSummary } from "../TripAccessView";

export type PhoneTripTabProps = {
  name: string;
  /** The trip's start date ("YYYY-MM-DD"), or undefined for an undated trip. */
  startDate: string | undefined;
  days: readonly DaySummary[];
  /** The trip's access; null until the access rules are loaded. */
  access: TripAccess | null;
  aire: readonly AireWarning[];
  onRename: (name: string) => void;
  /** Called with the chosen date, or undefined when the date is cleared. */
  onSetStartDate: (date: string | undefined) => void;
};

/**
 * The Trip tab (#123): the trip's name and start date, and its access summary
 * (whole trip and per day) under the "Indicative only" disclaimer. The totals
 * are in the peek, so they aren't repeated here.
 */
export default function PhoneTripTab({ name, startDate, days, access, aire, onRename, onSetStartDate }: PhoneTripTabProps) {
  return (
    <div className="phone-trip-tab">
      <label>
        <span>{strings.tripNameLabel}</span>
        <input
          type="text"
          value={name}
          placeholder={strings.tripNamePlaceholder}
          onChange={(event) => onRename(event.target.value)}
        />
      </label>
      <div className="phone-start-date">
        <label>
          <span>{strings.startDateLabel}</span>
          <input
            type="date"
            value={startDate ?? ""}
            // An empty value means the field was cleared (or holds no complete date yet).
            onChange={(event) => onSetStartDate(event.target.value || undefined)}
          />
        </label>
        {startDate !== undefined && (
          <Button className="phone-button" onClick={() => onSetStartDate(undefined)}>
            {strings.clearStartDateButton}
          </Button>
        )}
      </div>
      {access && (
        <>
          <p className="phone-disclaimer">{strings.navigationRulesNotice}</p>
          <TripAccessSummary access={access.trip} aire={aire} />
          {days.length > 0 && (
            <ol className="phone-day-access" aria-label={strings.phone.dayAccessLabel}>
              {days.map((day, i) => {
                const state = access.days[i]?.state;
                return (
                  <li key={i}>
                    <strong>{strings.dayLabel(i + 1)}</strong>
                    {day.date && <time dateTime={day.date}>{` ${formatDayDate(day.date)}`}</time>}
                    {state !== undefined && (
                      <span className={`access-status-${state}`}>
                        {` · ${strings.tripAccess.dayStatus(accessStateLabel(state))}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
