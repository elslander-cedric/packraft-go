"use client";

import type { LatLngExpression, Polygon as LeafletPolygon, Polyline as LeafletPolyline } from "leaflet";
import { useEffect, useRef } from "react";
import { LayerGroup, Pane, Polygon, Polyline } from "react-leaflet";
import type { AccessFeature, AccessState, Geometry, Position } from "@/core/access";
import { strings } from "@/ui/strings";
import { accessColours } from "./accessColours";

export type AccessLayerProps = {
  features: readonly AccessFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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

function AccessShape({ feature, selected, onSelect }: { feature: AccessFeature; selected: boolean; onSelect: () => void }) {
  const line = useRef<LeafletPolyline>(null);
  const area = useRef<LeafletPolygon>(null);
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
    bubblingMouseEvents: false,
    eventHandlers: { click: onSelect },
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

/** The access layer: specific waters coloured by access status, below the trip. */
export default function AccessLayer({ features, selectedId, onSelect }: AccessLayerProps) {
  return (
    <Pane name="access" pane="overlayPane" style={{ zIndex: 350 }}>
      <LayerGroup attribution={strings.accessAttribution}>
        {features.map((feature) => (
          <AccessShape
            key={feature.record.id}
            feature={feature}
            selected={feature.record.id === selectedId}
            onSelect={() => onSelect(feature.record.id)}
          />
        ))}
      </LayerGroup>
    </Pane>
  );
}
