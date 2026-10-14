"use client";

import { latLngBounds } from "leaflet";
import { useEffect, useRef } from "react";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { putInsAndTakeOuts, type LatLng, type Trip } from "@/core/trip";
import { baseLayer, initialMapView } from "./mapConfig";
import { legStyle, modeChangeStyle } from "./TripMap";
import AccessPointLayer, { type AccessPointLayerProps } from "./AccessPointLayer";

export type PhoneMapProps = {
  /** The trip, drawn read-only: taps never change it. */
  trip: Trip;
  /** Your position and the browser's accuracy radius in metres, once shown. */
  position: { at: LatLng; accuracyM: number } | null;
  /** Your access points: tap one to select it, drag it to correct it (#63). */
  accessPoints?: AccessPointLayerProps;
  /** When set, the next tap on the map places an access point there (#63). */
  onPlace?: (at: LatLng) => void;
};

/** Zoom used to show your position: close enough to see the river bank. */
const POSITION_ZOOM = 15;

const positionStyle = { color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 };
const accuracyStyle = { color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12 };

/** Fits the trip on screen once, and centres on your position when it is first shown. */
function MapView({ trip, position }: PhoneMapProps) {
  const map = useMap();
  useEffect(() => {
    if (trip.points.length > 0) map.fitBounds(latLngBounds(trip.points.map((p) => [p.lat, p.lng])), { padding: [24, 24] });
    // On opening and when another trip is opened; otherwise the map is the user's to move.
  }, [map, trip]);
  const centred = useRef(false);
  useEffect(() => {
    if (!position) {
      centred.current = false;
      return;
    }
    if (centred.current) return;
    centred.current = true;
    map.setView(position.at, Math.max(map.getZoom(), POSITION_ZOOM));
  }, [map, position]);
  return null;
}

/** Turns a tap on the map into a placed access point while placing. */
function TapToPlace({ onPlace }: { onPlace: (at: LatLng) => void }) {
  useMapEvents({ click: (event) => onPlace({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  return null;
}

/**
 * The phone's map (#56, ADR 0023): the trip drawn read-only, and your position
 * with its accuracy circle. Planning stays on the desktop map (TripMap).
 * Imports Leaflet, which needs `window`: only load this through ClientPhoneMap.
 */
export default function PhoneMap({ trip, position, accessPoints, onPlace }: PhoneMapProps) {
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
      <MapView trip={trip} position={position} />
      {trip.legs.map((leg, i) => (
        <Polyline
          key={`leg-${i}`}
          positions={leg.route?.status === "routed" ? [...leg.route.geometry] : [trip.points[i], trip.points[i + 1]]}
          className={`leg leg-${leg.mode}`}
          interactive={false}
          pathOptions={{ ...legStyle[leg.mode], dashArray: leg.route?.status === "failed" ? "8 8" : undefined }}
        />
      ))}
      {putInsAndTakeOuts(trip).map(({ kind, point }) => (
        <CircleMarker
          key={`${kind}-${point}`}
          center={trip.points[point]}
          radius={11}
          className={kind}
          interactive={false}
          pathOptions={{ ...modeChangeStyle[kind], weight: 3, fill: false }}
        />
      ))}
      {onPlace && <TapToPlace onPlace={onPlace} />}
      {accessPoints && <AccessPointLayer {...accessPoints} />}
      {position && (
        <>
          <Circle
            center={position.at}
            radius={position.accuracyM}
            className="my-position-accuracy"
            interactive={false}
            pathOptions={accuracyStyle}
          />
          <CircleMarker
            center={position.at}
            radius={8}
            className="my-position"
            interactive={false}
            pathOptions={positionStyle}
          />
        </>
      )}
    </MapContainer>
  );
}
