import type { FlowFigures } from "@/core/flow";
import { formatFlow, formatReadingTime } from "./format";
import { strings } from "./strings";
import "./FlowFiguresView.css";

/** Where the SPW's hydrometry data comes from: its legal notice asks for a credit linking here. */
const HYDROMETRY_URL = "https://hydrometrie.wallonie.be/";

/**
 * A Walloon stretch's live flow for today (#61): the gauge (and whether it is
 * assumed), the flow at 08:00, the 72-hour mean, the limits, when the gauge was
 * last measured, and the SPW credit. Renders the core's figures; no domain logic.
 */
export function FlowFiguresView({ figures }: { figures: FlowFigures }) {
  const { gauge, mean72h, at8, latest, minM3s, maxM3s } = figures;
  return (
    <div className="flow-figures">
      <p className="flow-heading">{strings.flow.heading}</p>
      <div className="flow-lines">
        <p className="flow-gauge">{gauge.assumed ? strings.flow.gaugeAssumed(gauge.name) : strings.flow.gauge(gauge.name)}</p>
        <p className="flow-at8">{at8 ? strings.flow.at8(formatFlow(at8.m3s)) : strings.flow.at8Missing}</p>
        <p className="flow-mean72h">
          {mean72h
            ? strings.flow.mean72h(formatFlow(mean72h.m3s), formatReadingTime(mean72h.at))
            : strings.flow.mean72hMissing}
        </p>
        {minM3s !== null && <p className="flow-limit">{strings.flow.minimum(formatFlow(minM3s))}</p>}
        <p className="flow-limit">{strings.flow.maximum(formatFlow(maxM3s))}</p>
        <p className="flow-last-measured">
          {latest ? strings.flow.lastMeasured(formatReadingTime(latest.at)) : strings.flow.noReadings}
        </p>
      </div>
      <p className="flow-credit">
        <a href={HYDROMETRY_URL} target="_blank" rel="noreferrer">
          {strings.flow.credit}
        </a>
      </p>
    </div>
  );
}
