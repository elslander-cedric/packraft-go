import type { TripSummary } from "@/core/summarise";
import type { LegMode } from "@/core/trip";
import { formatDistance } from "./format";
import { strings } from "./strings";

const modeLabel: Record<LegMode, string> = {
  hike: strings.legModeHike,
  paddle: strings.legModePaddle,
};

/** Lists each leg's figures and the trip totals. Renders a summary; no domain logic. */
export default function LegsPanel({ summary }: { summary: TripSummary }) {
  return (
    <aside className="legs-panel" aria-label={strings.legsPanelLabel}>
      <h2>{strings.legsPanelLabel}</h2>
      {summary.legs.length === 0 ? (
        <p className="legs-panel-empty">{strings.legsPanelEmpty}</p>
      ) : (
        <ol className="legs">
          {summary.legs.map((leg, i) => (
            <li key={i} className={`leg-row leg-row-${leg.mode}`}>
              <span>{strings.legLabel(i + 1)}</span>
              <span>{modeLabel[leg.mode]}</span>
              <span>{formatDistance(leg.distanceKm)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="trip-total">
        {`${strings.tripTotalDistance} ${formatDistance(summary.trip.distanceKm)}`}
      </p>
    </aside>
  );
}
