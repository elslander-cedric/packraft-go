import { divIcon, type DivIcon, type Polyline as LeafletPolyline } from "leaflet";
import { useEffect, useRef } from "react";
import { Marker, Pane, Polyline } from "react-leaflet";
import type { Position } from "@/core/geo";
import type { SuggestedTrip } from "@/core/suggestedTrips";
import { paneZIndex } from "./mapConfig";
import { SUGGESTION_HIT_ATTRIBUTE } from "./Taps";
import "./SuggestedTripLayer.css";

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.

export type SuggestedTripLayerProps = {
  /** The suggested trips, best first: each is drawn with its number in the list. */
  trips: readonly SuggestedTrip[];
  /** The selected one, by its index: highlighted, the others faded. */
  selected?: number | null;
};

/** Purple, away from the trip's own hike and paddle colours, on a white casing like the legs. */
const lineStyle = { color: "#8e24aa", weight: 5, opacity: 0.9 };
const casingStyle = { color: "#fff", weight: lineStyle.weight + 4, opacity: 1 };
/** Hike legs dotted, so the walks between waters read apart from the paddling. */
const hikeDashes = "1 9";
/** Behind a selected suggestion the others stay visible, so you still see where they are. */
const FADED_OPACITY = 0.25;
/** A line's unseen hit line, in screen pixels across: wide enough for a finger (ADR 0034). */
const HIT_WIDTH_PX = 28;
const hitStyle = { color: "#000", opacity: 0, weight: HIT_WIDTH_PX, fill: false };

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

type Look = "plain" | "selected" | "faded";
const lookClass: Record<Look, string> = {
  plain: "suggested-trip",
  selected: "suggested-trip suggested-trip-selected",
  faded: "suggested-trip suggested-trip-faded",
};
const lookOrder: Record<Look, number> = { faded: 0, plain: 1, selected: 2 };

/**
 * The suggested trips (ADR 0039): numbered lines in their own pane below the trip, so the trip
 * stays on top while you compare them. A tap on a line selects its trip, through the map's tap
 * handling. The list in the panel names them for screen readers, so the numbers here are hidden
 * from them.
 */
export default function SuggestedTripLayer({ trips, selected = null }: SuggestedTripLayerProps) {
  const lookOf = (i: number): Look => {
    if (selected === null) return "plain";
    return i === selected ? "selected" : "faded";
  };
  // The selected trip is drawn last, over the faded ones.
  const legs = trips
    .flatMap((trip, i) =>
      trip.legs.map((leg, j) => ({
        trip: i,
        look: lookOf(i),
        key: `${i}-${j}`,
        mode: leg.mode,
        line: leg.line.map(toLatLng),
      })),
    )
    .sort((a, b) => lookOrder[a.look] - lookOrder[b.look]);
  return (
    <Pane name="suggested-trips" pane="overlayPane" style={{ zIndex: paneZIndex.suggestedTrips }}>
      {legs.map(({ key, look, line }) => (
        <Polyline
          key={`casing-${key}-${look}`}
          positions={line}
          interactive={false}
          pathOptions={{ ...casingStyle, opacity: look === "faded" ? FADED_OPACITY : 1 }}
        />
      ))}
      {legs.map(({ key, look, mode, line }) => (
        // Keyed by its look, so a new look gets a new element with its class.
        <Polyline
          key={`${key}-${look}`}
          positions={line}
          interactive={false}
          className={`${lookClass[look]} suggested-trip-${mode}`}
          pathOptions={{
            ...lineStyle,
            opacity: look === "faded" ? FADED_OPACITY : lineStyle.opacity,
            dashArray: mode === "hike" ? hikeDashes : undefined,
            lineCap: "round",
          }}
        />
      ))}
      {legs.map(({ key, trip, line }) => (
        <HitLine key={`hit-${key}`} trip={trip} positions={line} />
      ))}
      {trips.map((trip, i) => (
        <Marker
          key={`${i}-${lookOf(i)}`}
          position={numberAt(trip)}
          icon={numberIcon(i + 1)}
          interactive={false}
          keyboard={false}
          opacity={lookOf(i) === "faded" ? FADED_OPACITY : 1}
          zIndexOffset={lookOf(i) === "selected" ? 1000 : 0}
        />
      ))}
    </Pane>
  );
}

/** A trip's unseen hit line: its element says which trip it is, so a tap on it selects that trip. */
function HitLine({ trip, positions }: { trip: number; positions: [number, number][] }) {
  const line = useRef<LeafletPolyline>(null);
  useEffect(() => {
    line.current?.getElement()?.setAttribute(SUGGESTION_HIT_ATTRIBUTE, String(trip));
  }, [trip]);
  return <Polyline ref={line} positions={positions} className="suggested-trip-hit" pathOptions={hitStyle} />;
}
