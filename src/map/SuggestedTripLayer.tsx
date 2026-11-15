import { divIcon, type DivIcon } from "leaflet";
import { Marker, Pane, Polyline } from "react-leaflet";
import type { Position } from "@/core/geo";
import type { SuggestedTrip } from "@/core/suggestedTrips";
import { paneZIndex } from "./mapConfig";
import "./SuggestedTripLayer.css";

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.

export type SuggestedTripLayerProps = {
  /** The suggested trips, best first: each is drawn with its number in the list. */
  trips: readonly SuggestedTrip[];
};

/** Purple, away from the trip's own hike and paddle colours, on a white casing like the legs. */
const lineStyle = { color: "#8e24aa", weight: 5, opacity: 0.9 };
const casingStyle = { color: "#fff", weight: lineStyle.weight + 4, opacity: 1 };

const toLatLng = ([lng, lat]: Position): [number, number] => [lat, lng];

// One icon per number, so a redraw doesn't replace the marker's element.
const numberIcons = new Map<number, DivIcon>();
function numberIcon(n: number): DivIcon {
  let icon = numberIcons.get(n);
  if (!icon) {
    icon = divIcon({
      className: "suggested-trip-number",
      html: `<span aria-hidden="true">${n}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    numberIcons.set(n, icon);
  }
  return icon;
}

/** Where a trip's number sits: halfway along its line, so the numbers of trips sharing an aire don't stack. */
function numberAt(trip: SuggestedTrip): [number, number] {
  const line = trip.legs.flatMap((leg) => leg.line);
  return toLatLng(line[Math.floor(line.length / 2)]);
}

/**
 * The suggested trips (ADR 0039): numbered lines in their own pane below the trip, so the trip
 * stays on top while you compare them. The list in the panel names them for screen readers, so
 * the numbers here are hidden from them.
 */
export default function SuggestedTripLayer({ trips }: SuggestedTripLayerProps) {
  const legs = trips.flatMap((trip, i) =>
    trip.legs.map((leg, j) => ({
      key: `${i}-${j}`,
      line: leg.line.map(toLatLng),
    })),
  );
  return (
    <Pane name="suggested-trips" pane="overlayPane" style={{ zIndex: paneZIndex.suggestedTrips }}>
      {legs.map(({ key, line }) => (
        <Polyline key={`casing-${key}`} positions={line} interactive={false} pathOptions={casingStyle} />
      ))}
      {legs.map(({ key, line }) => (
        <Polyline key={key} positions={line} interactive={false} className="suggested-trip" pathOptions={lineStyle} />
      ))}
      {trips.map((trip, i) => (
        <Marker key={i} position={numberAt(trip)} icon={numberIcon(i + 1)} interactive={false} keyboard={false} />
      ))}
    </Pane>
  );
}
