import type { AccessFeature, AccessReason, AccessState } from "@/core/access";
import { accessColours } from "@/map/accessColours";
import { Button } from "./components/Button";
import { Switch } from "./components/Switch";
import { strings } from "./strings";
import "./AccessPanel.css";

const states: readonly AccessState[] = ["open", "closed-today", "forbidden", "unknown"];

function Swatch({ state }: { state: AccessState }) {
  return <span className="access-swatch" style={{ background: accessColours[state] }} aria-hidden="true" />;
}

/** The access layer's switch and, while it is on, its legend (#53). */
export function AccessLayerControls({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="access-controls">
      <Switch label={strings.accessLayerToggle} checked={on} onChange={onToggle} />
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
      <p>{reason.ruleText}</p>
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
export function AccessDetailPanel({ feature, onClose }: { feature: AccessFeature; onClose: () => void }) {
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
      <ul className="access-reasons">
        {status.reasons.map((reason, i) => (
          <Reason key={i} reason={reason} />
        ))}
      </ul>
      <p className="access-legend-note">{strings.accessDataCredit}</p>
    </section>
  );
}
