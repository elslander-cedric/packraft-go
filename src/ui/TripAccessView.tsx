import type { AccessState } from "@/core/access";
import type { AireWarning } from "@/core/aire";
import type { LockWarning } from "@/core/locks";
import type { LegWarnings } from "@/core/dayWarnings";
import type { AccessNote, AccessWarning, LegAccess } from "@/core/tripAccess";
import { accessColours } from "@/map/accessColours";
import { Button } from "./components/Button";
import { FlowFiguresView } from "./FlowFiguresView";
import { formatDayDate } from "./format";
import { Icon } from "./icons/Icon";
import { icons, type IconDefinition } from "./icons/icons";
import { accessStateLabel, strings } from "./strings";
import "./TripAccessView.css";

// Access status and warnings on leg rows, and the warning chips on day cards (#58).
// Renders the core's trip access; no domain logic. Warnings are paragraphs, not
// list items, so leg rows keep exactly one list item each.

const statusIcon: Record<AccessState, IconDefinition> = {
  open: icons.accessOpen,
  "closed-today": icons.accessClosedToday,
  forbidden: icons.accessForbidden,
  unknown: icons.accessUnknown,
  checking: icons.accessChecking,
};

const warningIcon: Record<LegWarnings["kind"], IconDefinition> = {
  forbidden: icons.warningForbidden,
  closed: icons.warningClosed,
  "check-flow": icons.warningCheckFlow,
  lock: icons.warningLock,
  aire: icons.warningAire,
};

// Warnings take the colour of the status they come closest to: red for a ban, orange for the rest.
const warningColour: Record<LegWarnings["kind"], AccessState> = {
  forbidden: "forbidden",
  closed: "closed-today",
  "check-flow": "closed-today",
  lock: "closed-today",
  aire: "closed-today",
};

/** A status's or a warning's icon in the access colour of the map (decorative: the text names it). */
function AccessIcon({ icon, state }: { icon: IconDefinition; state: AccessState }) {
  return (
    <span className="access-icon" style={{ color: accessColours[state] }}>
      <Icon icon={icon} />
    </span>
  );
}

/** A status's icon in its colour, wherever a status is named in text. */
export function StatusIcon({ state }: { state: AccessState }) {
  return <AccessIcon icon={statusIcon[state]} state={state} />;
}

function WarningIcon({ kind }: { kind: LegWarnings["kind"] }) {
  return <AccessIcon icon={warningIcon[kind]} state={warningColour[kind]} />;
}

/** One warning: its kind, the water and rule behind it, and the rule's source. */
function Warning({ warning }: { warning: AccessWarning }) {
  const { reason } = warning;
  return (
    <p className={`access-warning access-warning-${warning.kind}`}>
      <WarningIcon kind={warning.kind} />
      <strong>{`${strings.tripAccess.warningKind[warning.kind]}: `}</strong>
      {reason.kind === "no-rule" ? null : (
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

/** Water with no known rules: a quiet, neutral note (not a warning), with the region's rule text when it has one. */
function Note({ note }: { note: AccessNote }) {
  const { reason } = note;
  return (
    <p className="access-note">
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

/** Lock warnings (#60): "lock at X: portage required", with the region's rule source. Never blocks. */
export function LockWarnings({ warnings }: { warnings: readonly LockWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="access-warnings lock-warnings">
      {warnings.map(({ lock, ...when }) => (
        <p key={`${when.leg}-${lock.id}`} className="access-warning access-warning-lock">
          <WarningIcon kind="lock" />
          <strong>{strings.tripAccess.lockWarning(lock.name)}</strong>{" "}
          <a href={lock.source.url} target="_blank" rel="noreferrer">
            {lock.source.title}
          </a>
        </p>
      ))}
    </div>
  );
}
function WarningList({ warnings }: { warnings: readonly AccessWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="access-warnings">
      {warnings.map((warning, i) => (
        <Warning key={i} warning={warning} />
      ))}
    </div>
  );
}

/** A paddle leg's access: status for its date (or in general), warnings and any extra rules as text. */
export function LegAccessView({ access }: { access: LegAccess }) {
  const { status, date } = access;
  const state = accessStateLabel(status.state);
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
        <StatusIcon state={status.state} />
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
      <LockWarnings warnings={access.lockWarnings} />
      {access.notes.map((note, i) => (
        <Note key={i} note={note} />
      ))}
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

/**
 * A day card's warnings: one chip per leg with any, naming its most serious kind and
 * how many more it has. The warnings' text is on the leg; a chip shows that leg.
 */
export function DayWarningChips({ legs, onShowLeg }: { legs: readonly LegWarnings[]; onShowLeg: (leg: number) => void }) {
  if (legs.length === 0) return null;
  return (
    <div className="day-warning-chips" role="group" aria-label={strings.tripAccess.dayWarningsLabel}>
      {legs.map(({ leg, kind, count }) => {
        const label = strings.tripAccess.chipKind[kind];
        return (
          <Button
            key={leg}
            className={`day-warning-chip day-warning-chip-${kind}`}
            aria-label={strings.tripAccess.chipName(leg + 1, label, count)}
            onClick={(event) => {
              // On the phone the chip sits on a day card, which takes taps of its own.
              event.stopPropagation();
              onShowLeg(leg);
            }}
          >
            <Icon icon={warningIcon[kind]} />
            {strings.tripAccess.chip(leg + 1, label)}
            {count > 1 && <span className="day-warning-chip-more">{strings.tripAccess.chipMore(count - 1)}</span>}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * A phone leg row's access at a glance: its status's icon, then one icon per kind of warning
 * it has (access, lock, aire), each icon once. Their names are only read out; the text is in
 * the leg's dialog.
 */
export function LegAccessIcons({
  state,
  access,
  aire,
  className,
}: {
  state: AccessState | undefined;
  access: LegAccess | undefined;
  aire: readonly AireWarning[];
  className?: string;
}) {
  const kinds: LegWarnings["kind"][] = [
    ...(access?.warnings ?? []).map((warning) => warning.kind),
    ...(access?.lockWarnings ?? []).map(() => "lock" as const),
    ...aire.map(() => "aire" as const),
  ];
  const all = [
    ...(state ? [{ icon: statusIcon[state], colour: state, label: strings.tripAccess.statusLine(accessStateLabel(state)) }] : []),
    ...kinds.map((kind) => ({ icon: warningIcon[kind], colour: warningColour[kind], label: strings.tripAccess.chipKind[kind] })),
  ];
  const shown = all.filter((item, i) => all.findIndex((other) => other.icon === item.icon) === i);
  if (shown.length === 0) return null;
  return (
    <span className={`leg-access-icons${className ? ` ${className}` : ""}`}>
      {shown.map(({ icon, colour, label }) => (
        <span key={icon.iconName}>
          <AccessIcon icon={icon} state={colour} />
          <span className="visually-hidden">{`${label}. `}</span>
        </span>
      ))}
    </span>
  );
}

/** Walloon aire warnings (#62): a put-in or take-out in Wallonia without an official aire of yours nearby. */
export function AireWarnings({ warnings }: { warnings: readonly AireWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="access-warnings aire-warnings">
      {warnings.map((warning) => (
        <p key={`${warning.kind}-${warning.point}`} className="access-warning access-warning-aire">
          <WarningIcon kind="aire" />
          <strong>{`${strings.aire.warningKind}: `}</strong>
          {strings.aire.text(strings.aire.kinds[warning.kind], warning.point + 1)}
        </p>
      ))}
    </div>
  );
}
