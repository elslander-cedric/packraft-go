"use client";

import type {
  CircleMarker as LeafletCircleMarker,
  LeafletEventHandlerFnMap,
  Polyline as LeafletPolyline,
} from "leaflet";
import { divIcon } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { SearchArea, SearchResult } from "@/core/placeSearch";
import { putInsAndTakeOuts, type LatLng, type LegMode, type ModeChange, type Trip } from "@/core/trip";
import { icons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import { strings } from "@/ui/strings";
import AccessLayer, { type AccessLayerProps } from "./AccessLayer";
import AccessPointLayer, { type AccessPointLayerProps } from "./AccessPointLayer";
import { baseLayer, initialMapView, paneZIndex } from "./mapConfig";
import SearchResultLayer from "./SearchResultLayer";

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
  /** The access layer to draw under the trip, when it is switched on. */
  access?: AccessLayerProps | null;
  /** Your access points (#55), drawn in their own layer. */
  accessPoints?: AccessPointLayerProps;
  /** The shown place search result (#173): the map moves to it and pins it. */
  searchResult?: SearchResult | null;
  /** The visible map, when it loads and after every move (place search ranks places in it). */
  onAreaChange?: (area: SearchArea) => void;
};

// Hike legs are thin and earth-coloured, paddle legs wider and water-blue, so the mix shows at a glance.
export const legStyle: Record<LegMode, { color: string; weight: number }> = {
  hike: { color: "#b5491b", weight: 4 },
  paddle: { color: "#1b6fb5", weight: 6 },
};

export const modeChangeStyle: Record<ModeChange["kind"], { color: string }> = {
  "put-in": { color: "#1a8f3a" },
  "take-out": { color: "#7a3fb5" },
};

const modeChangeLabel: Record<ModeChange["kind"], string> = {
  "put-in": strings.putIn,
  "take-out": strings.takeOut,
};

// A green triangle with a white tent in it (ADR 0028), drawn below and to the right of
// its point, clear of the point and of the put-in/take-out labels above it.
const campTentPlacement = { x: 6, y: 8.5, width: 8, height: 7.5 };
export const campIcon = divIcon({
  className: "camp-marker",
  html:
    `<svg role="img" aria-label=${JSON.stringify(strings.campMarker)} viewBox="0 0 20 18" width="20" height="18">` +
    '<path d="M10 1 L19 17 H1 Z" fill="#2e6b30" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
    `<g color="#fff">${iconSvg(icons.camp, campTentPlacement)}</g></svg>`,
  iconSize: [20, 18],
  iconAnchor: [-7, -5],
});

const pointStyle = { color: "#333", weight: 2, fillColor: "#fff", fillOpacity: 1 };
const selectedPointStyle = { ...pointStyle, color: "#000", weight: 3, fillColor: "#ffd400" };

// A press that moves less than this (in screen pixels) is a click, not a drag.
const DRAG_THRESHOLD_PX = 3;

type DragPreview = { index: number; at: LatLng };

type PointMarkerProps = {
  at: LatLng;
  selected: boolean;
  eventHandlers: LeafletEventHandlerFnMap;
  /** A pointer (mouse, finger or pen) was pressed on the point. */
  onPointerDown: (event: PointerEvent) => void;
  /** Called when the marker leaves the map (its point was deleted or undone). */
  onRemoved: () => void;
};

function PointMarker({ at, selected, eventHandlers, onPointerDown, onRemoved }: PointMarkerProps) {
  const marker = useRef<LeafletCircleMarker>(null);
  const removed = useRef(onRemoved);
  useEffect(() => {
    removed.current = onRemoved;
  });
  useEffect(() => () => removed.current(), []);
  // Leaflet has no pointer events for layers, so this listens on the point's own element.
  // It fires before the touchstart Leaflet uses to pan the map, so a finger on a point can switch panning off first.
  const pressed = useRef(onPointerDown);
  useEffect(() => {
    pressed.current = onPointerDown;
  });
  useEffect(() => {
    const element = marker.current?.getElement();
    const press = (event: Event) => pressed.current(event as PointerEvent);
    element?.addEventListener("pointerdown", press);
    return () => element?.removeEventListener("pointerdown", press);
  }, []);
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
const legModes: readonly LegMode[] = ["hike", "paddle"];

/** One leg's line, styled by mode; failed legs are dashed. */
function LegLine({ mode, status, positions }: { mode: LegMode; status: LegStatus; positions: LatLng[] }) {
  const line = useRef<LeafletPolyline>(null);
  // Leaflet only reads className when the path is created, and re-creating it
  // would move it to the end of the SVG (out of leg order), so the status and
  // mode classes are switched on the existing path.
  useEffect(() => {
    const element = line.current?.getElement();
    for (const s of legStatuses) element?.classList.toggle(`leg-${s}`, s === status);
    for (const m of legModes) element?.classList.toggle(`leg-${m}`, m === mode);
  }, [status, mode]);
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
  // A click always belongs to the press that started it, so this is reset on every press
  // (not after a timer, which a busy page can run after the next click: #19).
  const pressWasDrag = useRef(false);
  useEffect(() => {
    const container = map.getContainer();
    const press = () => (pressWasDrag.current = false);
    // Capture phase: runs before Leaflet's own handlers, including a point's pointerdown.
    container.addEventListener("pointerdown", press, true);
    return () => container.removeEventListener("pointerdown", press, true);
  }, [map]);
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
      if (pressWasDrag.current) return;
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  const startDrag = (index: number, down: PointerEvent) => {
    if (down.button !== 0) return;
    dragging.current = true;
    updateMapPanning();
    let dropAt: LatLng | null = null;

    const move = (event: PointerEvent) => {
      const far = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
      if (!dropAt && far < DRAG_THRESHOLD_PX) return;
      const { lat, lng } = map.mouseEventToLatLng(event);
      dropAt = { lat, lng };
      setPreview({ index, at: dropAt });
    };
    const end = (dropped: boolean) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      dragging.current = false;
      updateMapPanning();
      setPreview(null);
      if (dropped && dropAt) {
        pressWasDrag.current = true;
        onPointDrag(index, dropAt);
      }
    };
    const up = () => end(true);
    const cancel = () => end(false);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
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
    click: () => {
      if (!pressWasDrag.current) onPointClick(index);
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
        return <LegLine key={`leg-${i}`} mode={leg.mode} status={status} positions={positions} />;
      })}
      {/* Put-ins and take-outs: rings around the points where the mode changes, above the legs, below the points. */}
      <Pane name="trip-mode-changes" pane="overlayPane" style={{ zIndex: paneZIndex.tripModeChanges }}>
        {putInsAndTakeOuts(trip).map(({ kind, point }) => (
          <CircleMarker
            key={`${kind}-${point}`}
            center={points[point]}
            radius={11}
            className={kind}
            interactive={false}
            pathOptions={{ ...modeChangeStyle[kind], weight: 3, fill: false }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]} className={`${kind}-label`}>
              {modeChangeLabel[kind]}
            </Tooltip>
          </CircleMarker>
        ))}
      </Pane>
      {/* Camps: a tent just above the point, not clickable, so the point under it can still be grabbed. */}
      <Pane name="trip-camps" pane="overlayPane" style={{ zIndex: paneZIndex.tripCamps }}>
        {(trip.camps ?? []).map((point) => (
          <Marker key={`camp-${point}`} position={points[point]} icon={campIcon} interactive={false} keyboard={false} />
        ))}
      </Pane>
      {/* Points get their own pane above the legs, so a leg drawn later never covers a point. */}
      <Pane name="trip-points" pane="overlayPane" style={{ zIndex: paneZIndex.tripPoints }}>
        {points.map((point, i) => (
          <PointMarker
            key={`point-${i}`}
            at={point}
            selected={i === selectedPoint}
            eventHandlers={pointEvents(i)}
            onPointerDown={(event) => startDrag(i, event)}
            // A point can disappear under the mouse (deleted, undone): treat that as leaving it.
            onRemoved={leavePoint}
          />
        ))}
      </Pane>
    </>
  );
}

/** Tells `onChange` the visible map when it loads and after every move. */
function MapAreaReporter({ onChange }: { onChange: (area: SearchArea) => void }) {
  const map = useMap();
  const report = () => {
    const bounds = map.getBounds();
    onChange({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() });
  };
  useMapEvents({ moveend: report });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(report, [map]);
  return null;
}

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.
export default function TripMap({ access, searchResult, onAreaChange, ...props }: TripMapProps) {
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
      {access && <AccessLayer {...access} />}
      <TripLayers {...props} />
      {props.accessPoints && <AccessPointLayer {...props.accessPoints} />}
      {searchResult && <SearchResultLayer result={searchResult} />}
      {onAreaChange && <MapAreaReporter onChange={onAreaChange} />}
    </MapContainer>
  );
}
