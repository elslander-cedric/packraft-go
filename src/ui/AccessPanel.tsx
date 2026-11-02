import type { AccessFeature, AccessReason, AccessState, LockMarker } from "@/core/access";
import { accessPointUses, type AccessPointUse } from "@/core/accessPoints";
import type { OfficialAire, OfficialStretch } from "@/core/officialAire";
import { accessColours, accessUseColours } from "@/map/accessColours";
import { Button } from "./components/Button";
import { FlowFiguresView } from "./FlowFiguresView";
import { Icon } from "./icons/Icon";
import { icons } from "./icons/icons";
import { accessStateLabel, strings } from "./strings";
import { StatusIcon } from "./TripAccessView";
import "./AccessPanel.css";

const states: readonly Exclude<AccessState, "checking">[] = ["open", "closed-today", "forbidden", "unknown"];

function Swatch({ state }: { state: AccessState }) {
  return <span className="access-swatch" style={{ background: accessColours[state] }} aria-hidden="true" />;
}

const aireArrows = { "put-in": icons.airePutIn, "take-out": icons.aireTakeOut, both: icons.aireBoth } as const;

/** An official aire's marker, as on the map. */
function AireSwatch({ use }: { use: AccessPointUse }) {
  return (
    <span className="access-aire-swatch" style={{ background: accessUseColours[use] }} aria-hidden="true">
      <Icon icon={aireArrows[use]} />
    </span>
  );
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
export function AccessDateSelector({ date, isToday, onDate, onToday, tripDays }: AccessDateProps) {
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

/** The access layer's legend: the states' colours, the lock marker, the note about the regions and the credit. */
export function AccessLegend() {
  return (
    <section className="access-legend" aria-label={strings.accessLegendLabel}>
      <ul>
        {states.map((state) => (
          <li key={state} className={`access-legend-${state}`}>
            <Swatch state={state} />
            {strings.accessState[state]}
          </li>
        ))}
      </ul>
      <p className="access-legend-lock">
        <span className="access-lock-swatch" aria-hidden="true" />
        {strings.lockLegend}
      </p>
      {accessPointUses.map((use) => (
        <p key={use} className="access-legend-lock">
          <AireSwatch use={use} />
          {strings.officialAires.legend[use]}
        </p>
      ))}
      <p className="access-legend-note">{strings.accessLegendNote}</p>
      <p className="access-legend-note">{strings.accessDataCredit}</p>
    </section>
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

/** A lock: portage required, with where the rule comes from and when it was researched (#57). */
export function LockDetail({ lock }: { lock: LockMarker }) {
  return (
    <div className="access-detail">
      <p className="access-status access-status-lock">
        <span className="access-lock-swatch" aria-hidden="true" />
        {strings.lockPortageRequired}
      </p>
      <p>{strings.lockPortageText}</p>
      <p className="access-source">
        {strings.accessSourceLabel}{" "}
        <a href={lock.source.url} target="_blank" rel="noreferrer">
          {lock.source.title}
        </a>
        {" · "}
        {strings.accessResearched(lock.researched)}
      </p>
      <p className="access-legend-note">{strings.accessDataCredit}</p>
    </div>
  );
}

/** An official aire (ADR 0035): read-only, with how old the SPW's data on it is. */
export function OfficialAireDetail({ aire, stretch }: { aire: OfficialAire; stretch: OfficialStretch | undefined }) {
  const text = strings.officialAires;
  return (
    <div className="access-detail">
      <p className="access-status">
        <AireSwatch use={aire.use} />
        {text.legend[aire.use]}
      </p>
      {stretch && (
        <p>
          {text.stretchLabel}: {stretch.name}
        </p>
      )}
      <p>{text.lastChanged(aire.lastChanged)}</p>
      <p className="access-source">
        {strings.accessSourceLabel}{" "}
        <a href={aire.source.url} target="_blank" rel="noreferrer">
          {aire.source.title}
        </a>
        {" · "}
        {text.snapshot(aire.snapshot)}
      </p>
      <p className="access-legend-note">{strings.flow.credit}</p>
    </div>
  );
}

/** Why a water has its access status: status, reasons, extra rules, source and research date. */
export function AccessDetail({
  feature,
  date,
}: {
  feature: AccessFeature;
  /** The date the status is for. */
  date: string;
}) {
  const { status } = feature;
  return (
    <div className="access-detail">
      <p className={`access-status access-status-${status.state}`}>
        <StatusIcon state={status.state} />
        {accessStateLabel(status.state)}
      </p>
      <p className="access-legend-note access-status-date">{strings.accessStatusOn(date)}</p>
      <ul className="access-reasons">
        {status.reasons.map((reason, i) => (
          <Reason key={i} reason={reason} />
        ))}
      </ul>
      <p className="access-legend-note">{strings.accessDataCredit}</p>
    </div>
  );
}
