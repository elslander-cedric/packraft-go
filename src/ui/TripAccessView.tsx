import type { AccessState } from "@/core/access";
import type { AccessSummary, AccessWarning, DayAccess, LegAccess } from "@/core/tripAccess";
import { accessColours } from "@/map/accessColours";
import { FlowFiguresView } from "./FlowFiguresView";
import { formatDayDate } from "./format";
import { strings } from "./strings";
import "./TripAccessView.css";

// Access status and warnings on leg rows, day rows and the trip summary (#58).
// Renders the core's trip access; no domain logic. Warnings are paragraphs, not
// list items, so leg and day rows keep exactly one list item each.

function Swatch({ state }: { state: AccessState }) {
  return <span className="access-swatch" style={{ background: accessColours[state] }} aria-hidden="true" />;
}

/** One warning: its kind, the water and rule behind it, and the rule's source. */
function Warning({ warning, place }: { warning: AccessWarning; place?: string }) {
  const { reason } = warning;
  return (
    <p className={`access-warning access-warning-${warning.kind}`}>
      {place && <span className="access-warning-place">{`${place}: `}</span>}
      <strong>{`${strings.tripAccess.warningKind[warning.kind]}: `}</strong>
      {reason.kind === "no-rule" ? (
        strings.tripAccess.noRule
      ) : (
        <>
          {`${reason.name}. ${reason.ruleText} `}
          <a href={reason.source.url} target="_blank" rel="noreferrer">
            {reason.source.title}
          </a>
        </>
      )}
    </p>
  );
}

type Placed = (warning: AccessWarning) => string | undefined;

function WarningList({ warnings, place }: { warnings: readonly AccessWarning[]; place?: Placed }) {
  if (warnings.length === 0) return null;
  return (
    <div className="access-warnings">
      {warnings.map((warning, i) => (
        <Warning key={i} warning={warning} place={place?.(warning)} />
      ))}
    </div>
  );
}

/** A paddle leg's access: status for its date (or in general), warnings and any extra rules as text. */
export function LegAccessView({ access }: { access: LegAccess }) {
  const { status, date } = access;
  const state = strings.accessState[status.state];
  const extraRules = status.reasons.flatMap((reason) =>
    reason.kind === "rule" && (reason.conditions?.length || reason.link) ? [reason] : [],
  );
  // Without a date, the rules that allow paddling are shown in general terms too (warnings show the others).
  const generalRules = status.reasons.flatMap((reason) =>
    date === undefined && reason.kind === "rule" && reason.state === "open" ? [reason] : [],
  );
  return (
    <div className="leg-access">
      <p className={`leg-access-status access-status-${status.state}`}>
        <Swatch state={status.state} />
        {date === undefined
          ? strings.tripAccess.legStatusInGeneral(state)
          : strings.tripAccess.legStatusOn(formatDayDate(date), state)}
      </p>
      {generalRules.length > 0 && (
        <div className="leg-access-rules">
          {generalRules.map((reason) => (
            <p key={reason.recordId}>{`${reason.name}. ${reason.ruleText}`}</p>
          ))}
        </div>
      )}
      {access.checkFlowOnTheDay && <p className="leg-access-flow">{strings.tripAccess.checkFlowOnTheDay}</p>}
      <WarningList warnings={access.warnings} />
      {status.reasons.map((reason) =>
        reason.kind === "rule" && reason.flow ? <FlowFiguresView key={`flow:${reason.recordId}`} figures={reason.flow} /> : null,
      )}
      {extraRules.map((reason) => (
        <div key={reason.recordId} className="leg-access-extra">
          {reason.conditions?.length ? <span>{`${strings.accessConditionsHeading} (${reason.name}):`}</span> : null}
          {reason.conditions?.map((condition) => (
            <p key={condition} className="leg-access-condition">
              {condition}
            </p>
          ))}
          {reason.link && (
            <a href={reason.link.url} target="_blank" rel="noreferrer">
              {reason.link.title}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

/** A day's access: the most restrictive status of its paddle legs and their warnings. */
export function DayAccessView({ access }: { access: DayAccess }) {
  if (access.state === undefined) return null;
  return (
    <div className="day-access">
      <span className={`day-access-status access-status-${access.state}`}>
        <Swatch state={access.state} />
        {strings.tripAccess.dayStatus(strings.accessState[access.state])}
      </span>
      <WarningList warnings={access.warnings} place={(w) => strings.tripAccess.legPlace(w.leg + 1)} />
    </div>
  );
}

/** The trip's access summary: every warning, and that none of them blocks anything. */
export function TripAccessSummary({ access }: { access: AccessSummary }) {
  if (access.state === undefined) return null;
  const { warnings } = access;
  return (
    <section className="trip-access" aria-label={strings.tripAccess.summaryLabel}>
      <h2>{strings.tripAccess.summaryLabel}</h2>
      <p className={`access-status access-status-${access.state}`}>
        <Swatch state={access.state} />
        {warnings.length === 0 ? strings.tripAccess.summaryNone : strings.tripAccess.summaryCount(warnings.length)}
      </p>
      <WarningList warnings={warnings} place={(w) => strings.tripAccess.warningPlace(w.day + 1, w.leg + 1)} />
      <p className="trip-access-note">{strings.tripAccess.neverBlocks}</p>
    </section>
  );
}
