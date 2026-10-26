"use client";

import { latLngBounds, type Point } from "leaflet";
import { useEffect, useRef } from "react";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { putInsAndTakeOuts, type LatLng, type Trip } from "@/core/trip";
import { baseLayer, initialMapView } from "./mapConfig";
import { legStyle, modeChangeStyle } from "./TripMap";
import AccessPointLayer, { type AccessPointLayerProps } from "./AccessPointLayer";

/**
 * A place to show: zoomed in, centred in the part of the map the sheet leaves
 * free (it covers `coveredBelow` of the map's height).
 */
export type MapFocus = { at: LatLng; coveredBelow: number };

export type PhoneMapProps = {
  trip: Trip;
  /** A tap on the map (not a double tap, not the end of a pinch). */
  onMapTap: (at: LatLng) => void;
  /** Your position and the browser's accuracy radius in metres, once shown. */
  position: { at: LatLng; accuracyM: number } | null;
  /** Your access points: tap one to select it, drag it to correct it (#63). */
  accessPoints?: AccessPointLayerProps;
  /** A place to show (a new object shows it again). */
  focus?: MapFocus | null;
};

/** Zoom used to show your position: close enough to see the river bank. */
const POSITION_ZOOM = 15;

/** Two taps this close in time and place are one double tap, which does nothing. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 40;

const positionStyle = { color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 };
const accuracyStyle = { color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12 };
const pointStyle = { color: "#333", weight: 2, fillColor: "#fff", fillOpacity: 1 };

/** Fits the trip on screen when the map opens, and centres on your position when it is first shown. */
function MapView({ trip, position }: Pick<PhoneMapProps, "trip" | "position">) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    // Once: after that the map is the user's to move, however the trip changes.
    if (fitted.current || trip.points.length === 0) return;
    fitted.current = true;
    map.fitBounds(latLngBounds(trip.points.map((p) => [p.lat, p.lng])), { padding: [24, 24] });
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

/** Zooms in on `focus` and centres it above the sheet, whenever a new one is given. */
function Focus({ focus }: { focus: MapFocus }) {
  const map = useMap();
  useEffect(() => {
    const zoom = Math.max(map.getZoom(), POSITION_ZOOM);
    const shift = (map.getSize().y * focus.coveredBelow) / 2;
    map.setView(map.unproject(map.project(focus.at, zoom).add([0, shift]), zoom), zoom);
  }, [map, focus]);
  return null;
}

/**
 * Turns taps into `onMapTap`. A double tap gives one tap (its second tap is
 * ignored), and the click that can follow a pinch is ignored.
 */
function Taps({ onTap }: { onTap: (at: LatLng) => void }) {
  const map = useMap();
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const pinched = useRef(false);
  useEffect(() => {
    const container = map.getContainer();
    // Capture phase, before Leaflet's own handlers.
    const touch = (event: TouchEvent) => {
      pinched.current = event.touches.length > 1;
    };
    container.addEventListener("touchstart", touch, true);
    return () => container.removeEventListener("touchstart", touch, true);
  }, [map]);
  useMapEvents({
    click: (event) => {
      const now = event.originalEvent.timeStamp;
      const previous = lastTap.current;
      lastTap.current = { at: now, point: event.containerPoint };
      if (pinched.current) return;
      if (previous && now - previous.at < DOUBLE_TAP_MS && previous.point.distanceTo(event.containerPoint) < DOUBLE_TAP_PX) {
        return;
      }
      onTap({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/**
 * The phone's map (ADR 0026): the trip, your access points and your position.
 * Pinch zoom is on and double-tap zoom is off, because the first tap of a
 * double tap would add a point. Imports Leaflet, which needs `window`: only load
 * this through ClientPhoneMap.
 */
export default function PhoneMap({ trip, onMapTap, position, accessPoints, focus }: PhoneMapProps) {
  return (
    <MapContainer
      center={[...initialMapView.center]}
      zoom={initialMapView.zoom}
      style={{ height: "100%", width: "100%" }}
      doubleClickZoom={false}
      touchZoom
      zoomControl={false}
    >
      <TileLayer
        url={baseLayer.url}
        subdomains={[...baseLayer.subdomains]}
        maxZoom={baseLayer.maxZoom}
        attribution={baseLayer.attribution}
      />
      <MapView trip={trip} position={position} />
      {focus && <Focus focus={focus} />}
      <Taps onTap={onMapTap} />
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
      {trip.points.map((point, i) => (
        <CircleMarker
          key={`point-${i}`}
          center={point}
          radius={5}
          className="point"
          interactive={false}
          pathOptions={pointStyle}
        />
      ))}
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
