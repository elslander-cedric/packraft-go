"use client";

import type { CircleMarker as LeafletCircleMarker, Polyline as LeafletPolyline } from "leaflet";
import { latLngBounds, type Point } from "leaflet";
import { useEffect, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { putInsAndTakeOuts, type LatLng, type LegMode, type Trip } from "@/core/trip";
import { baseLayer, initialMapView } from "./mapConfig";
import { campIcon, legStyle, modeChangeStyle } from "./TripMap";
import AccessPointLayer, { type AccessPointLayerProps } from "./AccessPointLayer";
import { HIT_SIZE_PX, usePressDrag, type PressDragHandlers } from "./pressDrag";

/**
 * A place to show: zoomed in, centred in the part of the map the sheet leaves
 * free (it covers `coveredBelow` of the map's height).
 */
export type MapFocus = { at: LatLng; coveredBelow: number };

export type PhoneMapProps = {
  trip: Trip;
  /** A tap on the map (not a double tap, not the end of a pinch, not on a point). */
  onMapTap: (at: LatLng) => void;
  /** Index of the selected point, if any. */
  selectedPoint: number | null;
  /** A tap on a point (#120). */
  onPointTap: (index: number) => void;
  /** A point was pressed, dragged and let go at `to` (#120). */
  onPointDrop: (index: number, to: LatLng) => void;
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
const selectedPointStyle = { ...pointStyle, color: "#000", weight: 3, fillColor: "#ffd400" };
// A point's finger-sized hit area is invisible.
const hitStyle = { stroke: false, fillColor: "#000", fillOpacity: 0 };

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

/** A point's invisible 44 px hit area: tap it to select the point, press and drag it to move the point. */
function PointHitArea({ at, handlers }: { at: LatLng; handlers: PressDragHandlers }) {
  const hit = useRef<LeafletCircleMarker>(null);
  usePressDrag(hit, handlers);
  return (
    <CircleMarker
      ref={hit}
      center={at}
      radius={HIT_SIZE_PX / 2}
      className="point-hit"
      // Clicks on a point are for the point, not the map behind it.
      bubblingMouseEvents={false}
      pathOptions={hitStyle}
    />
  );
}

// Leaflet only reads className when a path is made, and making it again would
// move it to the end of the SVG (out of order), so classes are switched on the
// existing path.
function useClass(path: { current: { getElement(): Element | undefined } | null }, name: string, on: boolean) {
  useEffect(() => {
    path.current?.getElement()?.classList.toggle(name, on);
  }, [path, name, on]);
}

type LegStatus = "pending" | "routed" | "failed";

/** One leg's line; while one of its points is dragged it is a dashed straight line. */
function PhoneLeg({
  mode,
  status,
  positions,
  dragged,
}: {
  mode: LegMode;
  status: LegStatus;
  positions: LatLng[];
  dragged: boolean;
}) {
  const line = useRef<LeafletPolyline>(null);
  useClass(line, "leg-dragged", dragged);
  useClass(line, "leg-hike", mode === "hike");
  useClass(line, "leg-paddle", mode === "paddle");
  useClass(line, "leg-pending", status === "pending");
  useClass(line, "leg-routed", status === "routed");
  useClass(line, "leg-failed", status === "failed");
  const dashed = dragged || status === "failed";
  return (
    <Polyline
      ref={line}
      positions={positions}
      className={`leg leg-${mode}`}
      interactive={false}
      pathOptions={{ ...legStyle[mode], dashArray: dashed ? "8 8" : undefined }}
    />
  );
}

/** A trip point as drawn; its hit area is separate and larger. */
function PointDot({ at, selected }: { at: LatLng; selected: boolean }) {
  const dot = useRef<LeafletCircleMarker>(null);
  useClass(dot, "point-selected", selected);
  return (
    <CircleMarker
      ref={dot}
      center={at}
      radius={selected ? 7 : 5}
      className="point"
      interactive={false}
      pathOptions={selected ? selectedPointStyle : pointStyle}
    />
  );
}

/**
 * The trip: legs, put-ins and take-outs, camps and points. While a point is
 * dragged it is drawn under the finger and its legs are dashed straight lines;
 * the trip itself only changes when it is let go.
 */
function TripLayers({
  trip,
  selectedPoint,
  onPointTap,
  onPointDrop,
}: Pick<PhoneMapProps, "trip" | "selectedPoint" | "onPointTap" | "onPointDrop">) {
  const [preview, setPreview] = useState<{ index: number; at: LatLng } | null>(null);
  const points = preview ? trip.points.with(preview.index, preview.at) : trip.points;
  const handlers = (index: number): PressDragHandlers => ({
    onTap: () => onPointTap(index),
    onDrag: (at) => setPreview({ index, at }),
    onDrop: (to) => {
      setPreview(null);
      onPointDrop(index, to);
    },
    onCancel: () => setPreview(null),
  });
  return (
    <>
      {trip.legs.map((leg, i) => {
        const dragged = preview !== null && (preview.index === i || preview.index === i + 1);
        const routed = leg.route?.status === "routed" && !dragged;
        return (
          <PhoneLeg
            key={`leg-${i}`}
            mode={leg.mode}
            status={leg.route?.status ?? "pending"}
            dragged={dragged}
            positions={routed ? [...leg.route!.geometry] : [points[i], points[i + 1]]}
          />
        );
      })}
      {putInsAndTakeOuts(trip).map(({ kind, point }) => (
        <CircleMarker
          key={`${kind}-${point}`}
          center={points[point]}
          radius={11}
          className={kind}
          interactive={false}
          pathOptions={{ ...modeChangeStyle[kind], weight: 3, fill: false }}
        />
      ))}
      <Pane name="trip-camps" pane="overlayPane" style={{ zIndex: 402 }}>
        {(trip.camps ?? []).map((point) => (
          <Marker key={`camp-${point}`} position={points[point]} icon={campIcon} interactive={false} keyboard={false} />
        ))}
      </Pane>
      {/* Points get their own pane above the legs, so a leg never covers a point. */}
      <Pane name="trip-points" pane="overlayPane" style={{ zIndex: 401 }}>
        {points.map((point, i) => (
          <PointDot key={`point-${i}`} at={point} selected={i === selectedPoint} />
        ))}
      </Pane>
      {/* Their hit areas sit above the access-point markers (Leaflet's marker pane is 600), so a
          route point that is also an access point can still be selected and dragged (#120). */}
      <Pane name="trip-point-hits" style={{ zIndex: 620 }}>
        {points.map((point, i) => (
          <PointHitArea key={`hit-${i}`} at={point} handlers={handlers(i)} />
        ))}
      </Pane>
    </>
  );
}

/**
 * The phone's map (ADR 0026): the trip, your access points and your position.
 * Pinch zoom is on and double-tap zoom is off, because the first tap of a
 * double tap would add a point. Imports Leaflet, which needs `window`: only load
 * this through ClientPhoneMap.
 */
export default function PhoneMap({
  trip,
  onMapTap,
  selectedPoint,
  onPointTap,
  onPointDrop,
  position,
  accessPoints,
  focus,
}: PhoneMapProps) {
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
      <TripLayers trip={trip} selectedPoint={selectedPoint} onPointTap={onPointTap} onPointDrop={onPointDrop} />
      {accessPoints && <AccessPointLayer {...accessPoints} pressDrag />}
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
