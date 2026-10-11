"use client";

import type {
  CircleMarker as LeafletCircleMarker,
  LeafletEventHandlerFnMap,
  LeafletMouseEvent,
  Polyline as LeafletPolyline,
} from "leaflet";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Pane, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLng, LegMode, Trip } from "@/core/trip";
import { baseLayer, initialMapView } from "./mapConfig";

export type TripMapProps = {
  trip: Trip;
  /** Index of the selected point, if any. */
  selectedPoint: number | null;
  /** The planner clicked the map away from any point. */
  onMapClick: (at: LatLng) => void;
  /** The planner clicked an existing point (without dragging it). */
  onPointClick: (index: number) => void;
  /** The planner dragged an existing point and dropped it at `to`. */
  onPointDrag: (index: number, to: LatLng) => void;
};

const legStyle: Record<LegMode, { color: string; weight: number }> = {
  hike: { color: "#b5491b", weight: 4 },
  paddle: { color: "#1b6fb5", weight: 4 },
};

const pointStyle = { color: "#333", weight: 2, fillColor: "#fff", fillOpacity: 1 };
const selectedPointStyle = { ...pointStyle, color: "#000", weight: 3, fillColor: "#ffd400" };

// A press that moves less than this (in screen pixels) is a click, not a drag.
const DRAG_THRESHOLD_PX = 3;

type DragPreview = { index: number; at: LatLng };

type PointMarkerProps = {
  at: LatLng;
  selected: boolean;
  eventHandlers: LeafletEventHandlerFnMap;
  /** Called when the marker leaves the map (its point was deleted or undone). */
  onRemoved: () => void;
};

function PointMarker({ at, selected, eventHandlers, onRemoved }: PointMarkerProps) {
  const marker = useRef<LeafletCircleMarker>(null);
  const removed = useRef(onRemoved);
  useEffect(() => {
    removed.current = onRemoved;
  });
  useEffect(() => () => removed.current(), []);
  // Leaflet only reads className when the marker is created, so selection toggles the class directly.
  useEffect(() => {
    marker.current?.getElement()?.classList.toggle("point-selected", selected);
  }, [selected]);
  return (
    <CircleMarker
      ref={marker}
      center={at}
      radius={selected ? 7 : 5}
      className="point"
      // Clicks on a point are for the point, not the map behind it.
      bubblingMouseEvents={false}
      pathOptions={selected ? selectedPointStyle : pointStyle}
      eventHandlers={eventHandlers}
    />
  );
}

type LegStatus = "pending" | "routed" | "failed";
const legStatuses: readonly LegStatus[] = ["pending", "routed", "failed"];

/** One leg's line; failed legs are dashed. */
function LegLine({ mode, status, positions }: { mode: LegMode; status: LegStatus; positions: LatLng[] }) {
  const line = useRef<LeafletPolyline>(null);
  // Leaflet only reads className when the path is created, and re-creating it
  // would move it to the end of the SVG (out of leg order), so the status class
  // is switched on the existing path.
  useEffect(() => {
    const element = line.current?.getElement();
    for (const s of legStatuses) element?.classList.toggle(`leg-${s}`, s === status);
  }, [status]);
  return (
    <Polyline
      ref={line}
      positions={positions}
      // className must be a prop: react-leaflet applies pathOptions via setStyle, which ignores it.
      className={`leg leg-${mode} leg-${status}`}
      pathOptions={{ ...legStyle[mode], dashArray: status === "failed" ? "8 8" : undefined }}
    />
  );
}

/**
 * Draws the trip and turns mouse input into planner intentions: click the map,
 * click a point, drag a point. While a point is dragged it is drawn at the
 * mouse; the trip itself only changes when it is dropped.
 */
function TripLayers({ trip, selectedPoint, onMapClick, onPointClick, onPointDrag }: TripMapProps) {
  const map = useMap();
  const [preview, setPreview] = useState<DragPreview | null>(null);
  // The browser sends a click after a drag ends; that click must not add or select a point.
  const swallowNextClick = useRef(false);
  // Leaflet starts panning the map on the same press that would grab a point, so
  // panning is off while the mouse is over a point or a point is being dragged.
  const overPoint = useRef(false);
  const dragging = useRef(false);
  const updateMapPanning = () => {
    if (overPoint.current || dragging.current) map.dragging.disable();
    else map.dragging.enable();
  };

  useMapEvents({
    click: (event) => {
      if (swallowNextClick.current) return;
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  const startDrag = (index: number, down: MouseEvent) => {
    if (down.button !== 0) return;
    dragging.current = true;
    updateMapPanning();
    let dropAt: LatLng | null = null;

    const move = (event: MouseEvent) => {
      const far = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
      if (!dropAt && far < DRAG_THRESHOLD_PX) return;
      const { lat, lng } = map.mouseEventToLatLng(event);
      dropAt = { lat, lng };
      setPreview({ index, at: dropAt });
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      dragging.current = false;
      updateMapPanning();
      setPreview(null);
      if (dropAt) {
        swallowNextClick.current = true;
        setTimeout(() => (swallowNextClick.current = false), 0);
        onPointDrag(index, dropAt);
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const leavePoint = () => {
    overPoint.current = false;
    updateMapPanning();
  };

  const pointEvents = (index: number): LeafletEventHandlerFnMap => ({
    mouseover: () => {
      overPoint.current = true;
      updateMapPanning();
    },
    mouseout: leavePoint,
    mousedown: (event) => startDrag(index, (event as LeafletMouseEvent).originalEvent),
    click: () => {
      if (!swallowNextClick.current) onPointClick(index);
    },
  });

  const points = preview ? trip.points.with(preview.index, preview.at) : trip.points;

  return (
    <>
      {trip.legs.map((leg, i) => {
        const status = leg.route?.status ?? "pending";
        const dragged = preview !== null && (preview.index === i || preview.index === i + 1);
        // A routed leg follows its geometry; others (and legs touching a dragged
        // point) are a straight line, dashed if routing failed.
        const positions =
          leg.route?.status === "routed" && !dragged ? [...leg.route.geometry] : [points[i], points[i + 1]];
        return <LegLine key={`leg-${i}-${leg.mode}`} mode={leg.mode} status={status} positions={positions} />;
      })}
      {/* Points get their own pane above the legs, so a leg drawn later never covers a point. */}
      <Pane name="trip-points" pane="overlayPane" style={{ zIndex: 401 }}>
        {points.map((point, i) => (
          <PointMarker
            key={`point-${i}`}
            at={point}
            selected={i === selectedPoint}
            eventHandlers={pointEvents(i)}
            // A point can disappear under the mouse (deleted, undone): treat that as leaving it.
            onRemoved={leavePoint}
          />
        ))}
      </Pane>
    </>
  );
}

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.
export default function TripMap(props: TripMapProps) {
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
      <TripLayers {...props} />
    </MapContainer>
  );
}
