"use client";

import type { LatLngExpression, Polygon as LeafletPolygon, Polyline as LeafletPolyline } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, LayerGroup, Pane, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet";
import type { AccessFeature, AccessState, Geometry, LockMarker, Position } from "@/core/access";
import { strings } from "@/ui/strings";
import { accessColours } from "./accessColours";
import { listenForLegHold } from "./legHold";
import { lockMarkersMinZoom } from "./mapConfig";

export type AccessLayerProps = {
  features: readonly AccessFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Lock markers (#57), drawn above the waters. */
  locks?: readonly LockMarker[];
  /**
   * The phone's gestures (#125, ADR 0026): a tap on water is a tap on the map (it edits the
   * route), and holding a water 0.4 s (or a right-click on it) opens its details. Locks are
   * drawn above the legs' hit lines, so a tap on one opens its details.
   */
  touch?: boolean;
};

const toLatLng = ([lng, lat]: Position): LatLngExpression => [lat, lng];

/** Leaflet's nested lat/lng arrays for a geometry: lines for line geometries, rings for areas. */
function shapeOf(geometry: Geometry): { kind: "line" | "area"; positions: LatLngExpression[][] | LatLngExpression[][][] } {
  switch (geometry.type) {
    case "LineString":
      return { kind: "line", positions: [geometry.coordinates.map(toLatLng)] };
    case "MultiLineString":
      return { kind: "line", positions: geometry.coordinates.map((line) => line.map(toLatLng)) };
    case "Polygon":
      return { kind: "area", positions: [geometry.coordinates.map((ring) => ring.map(toLatLng))] };
    case "MultiPolygon":
      return { kind: "area", positions: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(toLatLng))) };
  }
}

/** With `on`, holding the shape still for 0.4 s (the timer used to insert a point on a leg) calls `onHold`. */
function useHold(
  line: { current: LeafletPolyline | null },
  area: { current: LeafletPolygon | null },
  on: boolean,
  onHold: () => void,
) {
  const map = useMap();
  const latest = useRef(onHold);
  useEffect(() => {
    latest.current = onHold;
  });
  useEffect(() => {
    const element = (line.current ?? area.current)?.getElement();
    if (!on || !element) return;
    return listenForLegHold(element, map, () => () => latest.current());
  }, [map, line, area, on]);
}

type AccessShapeProps = { feature: AccessFeature; selected: boolean; onSelect: () => void; touch: boolean };

function AccessShape({ feature, selected, onSelect, touch }: AccessShapeProps) {
  const line = useRef<LeafletPolyline>(null);
  const area = useRef<LeafletPolygon>(null);
  useHold(line, area, touch, onSelect);
  const state: AccessState = feature.status.state;
  const { kind, positions } = shapeOf(feature.record.geometry);
  const colour = accessColours[state];
  // Leaflet only reads className when the path is created, so selection toggles the class directly.
  useEffect(() => {
    (line.current ?? area.current)?.getElement()?.classList.toggle("access-selected", selected);
  }, [selected]);
  const common = {
    // Classes let tests and styles find a water by id and state.
    className: `access-feature access-${state} access-record-${feature.record.id}`,
    // A click on a water opens its details; it doesn't add a point to the trip.
    // On the phone a tap on water is a tap on the map, and a hold opens the details.
    ...(touch ? {} : { bubblingMouseEvents: false, eventHandlers: { click: onSelect } }),
  };
  return kind === "line" ? (
    <Polyline
      ref={line}
      positions={positions as LatLngExpression[][]}
      pathOptions={{ color: colour, weight: selected ? 7 : 4, opacity: 0.9 }}
      {...common}
    />
  ) : (
    <Polygon
      ref={area}
      positions={positions as LatLngExpression[][][]}
      pathOptions={{ color: colour, weight: selected ? 3 : 1, fillColor: colour, fillOpacity: 0.35 }}
      {...common}
    />
  );
}

function LockShape({ lock, selected, onSelect }: { lock: LockMarker; selected: boolean; onSelect: () => void }) {
  return (
    <CircleMarker
      center={toLatLng(lock.position)}
      radius={selected ? 8 : 6}
      pathOptions={{ color: "#1a1a1a", weight: selected ? 4 : 3, fillColor: "#ffffff", fillOpacity: 1 }}
      // Classes let tests and styles find a lock by id.
      className={`access-lock access-lock-${lock.id}`}
      bubblingMouseEvents={false}
      eventHandlers={{ click: onSelect }}
    />
  );
}

/** The lock markers, once the map is zoomed in far enough for them not to cover the waters. */
function LockMarkers({ locks, selectedId, onSelect }: Required<Pick<AccessLayerProps, "locks" | "selectedId" | "onSelect">>) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (zoom < lockMarkersMinZoom) return null;
  return locks.map((lock) => (
    <LockShape key={lock.id} lock={lock} selected={lock.id === selectedId} onSelect={() => onSelect(lock.id)} />
  ));
}

/** The access layer: specific waters coloured by access status, and lock markers, below the trip. */
export default function AccessLayer({ features, selectedId, onSelect, locks = [], touch = false }: AccessLayerProps) {
  const lockMarkers = <LockMarkers locks={locks} selectedId={selectedId} onSelect={onSelect} />;
  return (
    <>
      <Pane name="access" pane="overlayPane" style={{ zIndex: 350 }}>
        <LayerGroup attribution={strings.accessAttribution}>
          {features.map((feature) => (
            <AccessShape
              // Leaflet reads the class name only when a path is created, so a new state makes a new path.
              key={`${feature.record.id}:${feature.status.state}`}
              feature={feature}
              selected={feature.record.id === selectedId}
              onSelect={() => onSelect(feature.record.id)}
              touch={touch}
            />
          ))}
          {!touch && lockMarkers}
        </LayerGroup>
      </Pane>
      {/* On the phone, locks sit above the legs' hit lines (the phone map's pane at 450) and below
          the access-point markers, so a tap on a lock on a leg still opens the lock. */}
      {touch && (
        <Pane name="access-locks" style={{ zIndex: 460 }}>
          {lockMarkers}
        </Pane>
      )}
    </>
  );
}
