import type { TripSummary } from "@/core/summarise";
import type { Trip } from "@/core/trip";
import { formatDayDate, formatDistance, formatElevation, formatTimeEstimate } from "../format";
import { strings } from "../strings";

const modeLabel = { hike: strings.legModeHike, paddle: strings.legModePaddle } as const;

/**
 * The trip on a phone, read-only (#56, ADR 0023): its legs, days and figures,
 * from the core's summary. Nothing here changes the trip.
 */
export default function PhoneTripView({ trip, summary }: { trip: Trip; summary: TripSummary }) {
  return (
    <section className="phone-trip" aria-label={strings.phone.tripLabel}>
      {trip.points.length === 0 ? (
        <p className="phone-trip-empty">{strings.phone.tripEmpty}</p>
      ) : (
        <>
          <h2>{trip.name || strings.tripNamePlaceholder}</h2>
          <p className="phone-trip-note">{strings.phone.readOnlyNote}</p>
          <p className="phone-trip-totals">
            <span>{`${strings.tripTotalDistance} ${formatDistance(summary.trip.distanceKm)}`}</span>
            <span>
              {`${strings.tripTotalTimeEstimate} ${formatTimeEstimate(summary.trip.timeH, summary.trip.timeStatus)}`}
            </span>
          </p>
          {summary.days.length > 0 && (
            <>
              <h3>{strings.daysPanelLabel}</h3>
              <ol className="phone-days" aria-label={strings.daysPanelLabel}>
                {summary.days.map((day, i) => (
                  <li key={i} className="phone-row">
                    <span className="phone-row-heading">
                      <span>{strings.dayLabel(i + 1)}</span>{" "}
                      {day.date && <time dateTime={day.date}>{formatDayDate(day.date)}</time>}
                    </span>
                    <span>{strings.dayLegs(day.firstLeg + 1, day.lastLeg + 1)}</span>
                    <span>{`${strings.dayHikeDistance} ${formatDistance(day.hikeDistanceKm)}`}</span>
                    <span>{`${strings.dayPaddleDistance} ${formatDistance(day.paddleDistanceKm)}`}</span>
                    <span>{`${strings.climbLabel} ${formatElevation(day.climbM)}`}</span>
                    <span>{`${strings.descentLabel} ${formatElevation(day.descentM)}`}</span>
                    <span>{`${strings.dayTimeEstimate} ${formatTimeEstimate(day.timeH, day.timeStatus)}`}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h3>{strings.legsPanelLabel}</h3>
          <ol className="phone-legs" aria-label={strings.legsPanelLabel}>
            {summary.legs.map((leg, i) => (
              <li key={i} className={`phone-row phone-row-${leg.mode}`}>
                <span className="phone-row-heading">
                  <span>{strings.legLabel(i + 1)}</span> <span>{modeLabel[leg.mode]}</span>
                </span>
                <span>{formatDistance(leg.distanceKm)}</span>
                {leg.climbM !== undefined && <span>{`${strings.climbLabel} ${formatElevation(leg.climbM)}`}</span>}
                {leg.descentM !== undefined && (
                  <span>{`${strings.descentLabel} ${formatElevation(leg.descentM)}`}</span>
                )}
                {leg.dropM !== undefined && <span>{`${strings.dropLabel} ${formatElevation(leg.dropM)}`}</span>}
                {leg.riseM !== undefined && <span>{strings.riseFigure(formatElevation(leg.riseM))}</span>}
                <span>{`${strings.legTimeEstimate} ${formatTimeEstimate(leg.timeH, leg.timeStatus)}`}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
