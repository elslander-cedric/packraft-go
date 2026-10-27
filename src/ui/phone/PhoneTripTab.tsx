import { Button } from "../components/Button";
import { strings } from "../strings";

export type PhoneTripTabProps = {
  name: string;
  /** The trip's start date ("YYYY-MM-DD"), or undefined for an undated trip. */
  startDate: string | undefined;
  onRename: (name: string) => void;
  /** Called with the chosen date, or undefined when the date is cleared. */
  onSetStartDate: (date: string | undefined) => void;
};

/**
 * The Trip tab (#123): the trip's name and start date. The totals are in the
 * peek and each day's access is on its card in the Days tab, so neither is
 * repeated here.
 */
export default function PhoneTripTab({ name, startDate, onRename, onSetStartDate }: PhoneTripTabProps) {
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
    </div>
  );
}
