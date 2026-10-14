import type { AccessFeature, AccessReason, AccessState } from "@/core/access";
import { accessColours } from "@/map/accessColours";
import { Button } from "./components/Button";
import { FlowFiguresView } from "./FlowFiguresView";
import { Switch } from "./components/Switch";
import { strings } from "./strings";
import "./AccessPanel.css";

const states: readonly AccessState[] = ["open", "closed-today", "forbidden", "unknown"];

function Swatch({ state }: { state: AccessState }) {
  return <span className="access-swatch" style={{ background: accessColours[state] }} aria-hidden="true" />;
}

export type AccessTripDay = { readonly day: number; readonly date: string };

export type AccessDateProps = {
  /** The date the layer shows, YYYY-MM-DD. */
  date: string;
  /** Whether the date is today (the default). */
  isToday: boolean;
  onDate: (date: string) => void;
  onToday: () => void;
  /** The trip's dated days, when the trip has a start date. */
  tripDays: readonly AccessTripDay[];
};

/** The date the layer is for: today by default, or any date, or one of the trip's days (#59). */
function AccessDateSelector({ date, isToday, onDate, onToday, tripDays }: AccessDateProps) {
  return (
    <div className="access-date">
      <label>
        <span>{strings.accessDateLabel}</span>
        <input
          type="date"
          value={date}
          // An empty value means the field was cleared (or holds no complete date yet): keep the last date.
          onChange={(event) => event.target.value && onDate(event.target.value)}
        />
      </label>
      {!isToday && <Button onClick={onToday}>{strings.accessTodayButton}</Button>}
      {tripDays.length > 0 && (
        <label>
          <span>{strings.accessTripDayLabel}</span>
          <select value={tripDays.some((d) => d.date === date) ? date : ""} onChange={(e) => e.target.value && onDate(e.target.value)}>
            <option value="">{strings.accessTripDayChoose}</option>
            {tripDays.map(({ day, date: dayDate }) => (
              <option key={day} value={dayDate}>
                {strings.accessTripDayOption(day, dayDate)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** The access layer's switch and, while it is on, its date and legend (#53, #59). */
export function AccessLayerControls({
  on,
  onToggle,
  dateSelector,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  dateSelector: AccessDateProps;
}) {
  return (
    <div className="access-controls">
      <Switch label={strings.accessLayerToggle} checked={on} onChange={onToggle} />
      {on && <AccessDateSelector {...dateSelector} />}
      {on && (
        <section className="access-legend" aria-label={strings.accessLegendLabel}>
          <ul>
            {states.map((state) => (
              <li key={state} className={`access-legend-${state}`}>
                <Swatch state={state} />
                {strings.accessState[state]}
              </li>
            ))}
          </ul>
          <p className="access-legend-note">{strings.accessLegendNote}</p>
          <p className="access-legend-note">{strings.accessDataCredit}</p>
        </section>
      )}
    </div>
  );
}

function Reason({ reason }: { reason: AccessReason }) {
  if (reason.kind === "no-rule") return <li>{strings.accessNoRule}</li>;
  return (
    <li>
      {reason.category && <p className="access-category">{strings.accessCategory(reason.category)}</p>}
      <p>{reason.ruleText}</p>
      {reason.flow && <FlowFiguresView figures={reason.flow} />}
      {reason.conditions && reason.conditions.length > 0 && (
        <>
          <h4>{strings.accessConditionsHeading}</h4>
          <ul className="access-conditions">
            {reason.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </>
      )}
      {reason.link && (
        <p>
          <a href={reason.link.url} target="_blank" rel="noreferrer">
            {reason.link.title}
          </a>
        </p>
      )}
      <p className="access-source">
        {strings.accessSourceLabel}{" "}
        <a href={reason.source.url} target="_blank" rel="noreferrer">
          {reason.source.title}
        </a>
        {" · "}
        {strings.accessResearched(reason.researched)}
      </p>
      {reason.unverified && <p className="access-unverified">{strings.accessUnverified(reason.unverified)}</p>}
    </li>
  );
}

/** Why a water has its access status: status, reasons, extra rules, source and research date. */
export function AccessDetailPanel({
  feature,
  date,
  onClose,
}: {
  feature: AccessFeature;
  /** The date the status is for. */
  date: string;
  onClose: () => void;
}) {
  const { record, status } = feature;
  return (
    <section className="access-detail" aria-label={strings.accessDetailLabel}>
      <header>
        <h3>{record.name}</h3>
        <Button className="access-detail-close" onClick={onClose}>
          {strings.accessDetailClose}
        </Button>
      </header>
      <p className={`access-status access-status-${status.state}`}>
        <Swatch state={status.state} />
        {strings.accessState[status.state]}
      </p>
      <p className="access-legend-note access-status-date">{strings.accessStatusOn(date)}</p>
      <ul className="access-reasons">
        {status.reasons.map((reason, i) => (
          <Reason key={i} reason={reason} />
        ))}
      </ul>
      <p className="access-legend-note">{strings.accessDataCredit}</p>
    </section>
  );
}
