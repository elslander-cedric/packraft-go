"use client";

import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng, LegMode, Trip } from "@/core/trip";
import { baseLayer, initialMapView } from "./mapConfig";

export type TripMapProps = {
  trip: Trip;
  onMapClick: (at: LatLng) => void;
};

const legStyle: Record<LegMode, { color: string; weight: number }> = {
  hike: { color: "#b5491b", weight: 4 },
  paddle: { color: "#1b6fb5", weight: 4 },
};

function MapClicks({ onMapClick }: Pick<TripMapProps, "onMapClick">) {
  useMapEvents({
    click: (event) => onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.
export default function TripMap({ trip, onMapClick }: TripMapProps) {
  return (
    <MapContainer
      center={[...initialMapView.center]}
      zoom={initialMapView.zoom}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url={baseLayer.url}
        subdomains={[...baseLayer.subdomains]}
        maxZoom={baseLayer.maxZoom}
        attribution={baseLayer.attribution}
      />
      <MapClicks onMapClick={onMapClick} />
      {trip.legs.map((leg, i) => {
        const status = leg.route?.status ?? "pending";
        // A routed leg follows its geometry; others are a straight line, dashed if routing failed.
        const positions = leg.route?.status === "routed" ? [...leg.route.geometry] : [trip.points[i], trip.points[i + 1]];
        return (
          <Polyline
            // The key includes the status: Leaflet only reads className when the path is created.
            key={`leg-${i}-${leg.mode}-${status}`}
            positions={positions}
            // className must be a prop: react-leaflet applies pathOptions via setStyle, which ignores it.
            className={`leg leg-${leg.mode} leg-${status}`}
            pathOptions={{ ...legStyle[leg.mode], dashArray: status === "failed" ? "8 8" : undefined }}
          />
        );
      })}
      {trip.points.map((point, i) => (
        <CircleMarker
          key={`point-${i}`}
          center={point}
          radius={5}
          className="point"
          pathOptions={{ color: "#333", weight: 2, fillColor: "#fff", fillOpacity: 1 }}
        />
      ))}
    </MapContainer>
  );
}
