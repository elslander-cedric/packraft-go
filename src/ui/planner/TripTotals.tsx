import type { TripSummary } from "@/core/summarise";
import { formatDistance, formatElevation, formatTimeEstimate } from "../format";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";

/**
 * The trip's totals in the sheet's peek: hike and paddle distance, climb, descent and time,
 * each after its icon. A figure that is zero is left out; an empty trip shows nothing.
 */
export default function TripTotals({ trip }: { trip: TripSummary["trip"] }) {
  if (trip.distanceKm === 0) return null;
  const { labels } = strings.planner.totals;
  const figures = [
    { key: "hike", value: trip.hikeDistanceKm > 0 && formatDistance(trip.hikeDistanceKm) },
    { key: "paddle", value: trip.paddleDistanceKm > 0 && formatDistance(trip.paddleDistanceKm) },
    { key: "climb", value: Math.round(trip.climbM) > 0 && formatElevation(trip.climbM) },
    { key: "descent", value: Math.round(trip.descentM) > 0 && formatElevation(trip.descentM) },
    { key: "time", value: formatTimeEstimate(trip.timeH, trip.timeStatus) },
  ] as const;
  return (
    <p className="planner-totals">
      {figures.map(
        ({ key, value }) =>
          value && (
            <span key={key} className="planner-total">
              <Icon icon={icons[key]} className="planner-total-icon" />
              <span className="visually-hidden">{`${labels[key]} `}</span>
              {value}
            </span>
          ),
      )}
    </p>
  );
}
