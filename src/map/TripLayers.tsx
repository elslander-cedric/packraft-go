import type { CircleMarker as LeafletCircleMarker, Polyline as LeafletPolyline } from "leaflet";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { CircleMarker, Marker, Pane, Polyline, useMap } from "react-leaflet";
import { putInsAndTakeOuts, type LatLng, type LegMode } from "@/core/trip";
import { useHold } from "./hold";
import { paneZIndex } from "./mapConfig";
import { isPointNumbered } from "./pointNumbers";
import { HIT_SIZE_PX, usePressDrag, type PressDragHandlers } from "./pressDrag";
import { LEG_HIT_ATTRIBUTE } from "./Taps";
import type { TripMapProps } from "./TripMap";
import {
  campIcon,
  legCasingStyle,
  legStyle,
  modeChangeStyle,
  pointNumberIcon,
  selectedLegCasingStyle,
} from "./tripStyles";

const pointStyle = { color: "#333", weight: 2, fillColor: "#fff", fillOpacity: 1 };
const selectedPointStyle = { ...pointStyle, color: "#000", weight: 3, fillColor: "#ffd400" };
// A point's finger-sized hit area is invisible.
const hitStyle = { stroke: false, fillColor: "#000", fillOpacity: 0 };

/** The map's zoom; a zoom redraws the caller. */
function useZoom(): number {
  const map = useMap();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Attached before any effect runs, so the zoom of MapView's opening fit isn't missed.
  useLayoutEffect(() => {
    map.on("zoomend", redraw);
    return () => {
      map.off("zoomend", redraw);
    };
  }, [map]);
  return map.getZoom();
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

/** One leg's line on its casing; while one of its points is dragged it is a dashed straight line. */
function MapLeg({
  mode,
  status,
  positions,
  dragged,
  selected,
}: {
  mode: LegMode;
  status: LegStatus;
  positions: LatLng[];
  dragged: boolean;
  selected: boolean;
}) {
  const line = useRef<LeafletPolyline>(null);
  const casing = useRef<LeafletPolyline>(null);
  useClass(casing, "leg-casing-selected", selected);
  useClass(line, "leg-dragged", dragged);
  useClass(line, "leg-hike", mode === "hike");
  useClass(line, "leg-paddle", mode === "paddle");
  useClass(line, "leg-pending", status === "pending");
  useClass(line, "leg-routed", status === "routed");
  useClass(line, "leg-failed", status === "failed");
  const dashed = dragged || status === "failed";
  return (
    <>
      <Polyline
        ref={casing}
        positions={positions}
        interactive={false}
        className="leg-casing"
        pathOptions={(selected ? selectedLegCasingStyle : legCasingStyle)[mode]}
      />
      <Polyline
        ref={line}
        positions={positions}
        className={`leg leg-${mode}`}
        interactive={false}
        pathOptions={{ ...legStyle[mode], dashArray: dashed ? "8 8" : undefined }}
      />
    </>
  );
}

/** A leg's transparent hit line, in screen pixels across (#122). */
const LEG_HIT_WIDTH_PX = 28;

// A leg's hit line is invisible; Leaflet still hits its stroke.
const legHitStyle = { color: "#000", opacity: 0, weight: LEG_HIT_WIDTH_PX, fill: false };

/**
 * A leg's transparent 28 px hit line: hold it 0.4 s (or right-click it) to
 * insert a point (#122). Its element says which leg it is, so the map's tap
 * handling makes a tap on it a tap on the leg (#230).
 */
function LegHitLine({ leg, positions, onHold }: { leg: number; positions: LatLng[]; onHold: (at: LatLng) => void }) {
  const line = useRef<LeafletPolyline>(null);
  useHold(line, onHold);
  useEffect(() => {
    line.current?.getElement()?.setAttribute(LEG_HIT_ATTRIBUTE, String(leg));
  }, [leg]);
  return <Polyline ref={line} positions={positions} className="leg-hit" pathOptions={legHitStyle} />;
}

/** A trip point as drawn, a badge for its number while numbered; its hit area is separate and larger. */
function PointDot({ at, selected, numbered }: { at: LatLng; selected: boolean; numbered: boolean }) {
  const dot = useRef<LeafletCircleMarker>(null);
  useClass(dot, "point-selected", selected);
  return (
    <CircleMarker
      ref={dot}
      center={at}
      radius={numbered ? (selected ? 12 : 10) : selected ? 7 : 5}
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
export function TripLayers({
  trip,
  selectedPoint,
  onPointTap,
  onPointDrop,
  onLegHold,
  selectedLeg,
  frozen,
}: Pick<TripMapProps, "trip" | "selectedPoint" | "onPointTap" | "onPointDrop" | "onLegHold" | "selectedLeg" | "frozen">) {
  const [preview, setPreview] = useState<{ index: number; at: LatLng } | null>(null);
  const zoom = useZoom();
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
  const legs = trip.legs.map((leg, i) => {
    const dragged = preview !== null && (preview.index === i || preview.index === i + 1);
    const routed = leg.route?.status === "routed" && !dragged;
    const positions = routed ? [...leg.route!.geometry] : [points[i], points[i + 1]];
    return { leg, dragged, positions };
  });
  return (
    <>
      {/* The legs, above the access layer's waters. */}
      <Pane name="trip-legs" pane="overlayPane" style={{ zIndex: paneZIndex.tripLegs }}>
        {legs.map(({ leg, dragged, positions }, i) => (
          <MapLeg
            key={`leg-${i}`}
            mode={leg.mode}
            status={leg.route?.status ?? "pending"}
            dragged={dragged}
            positions={positions}
            selected={i === selectedLeg}
          />
        ))}
      </Pane>
      {/* Leg hit lines sit above the drawn trip but under the access-point markers and the
          points' hit areas, so a point or an access point on a leg is still grabbed first. */}
      <Pane name="trip-leg-hits" style={{ zIndex: paneZIndex.tripLegHits }}>
        {!frozen &&
          legs.map(({ positions }, i) => (
            <LegHitLine key={`leg-hit-${i}`} leg={i} positions={positions} onHold={(at) => onLegHold(i, at)} />
          ))}
      </Pane>
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
      <Pane name="trip-camps" pane="overlayPane" style={{ zIndex: paneZIndex.tripCamps }}>
        {(trip.camps ?? []).map((point) => (
          <Marker key={`camp-${point}`} position={points[point]} icon={campIcon} interactive={false} keyboard={false} />
        ))}
      </Pane>
      {/* Points get their own pane above the legs, so a leg never covers a point. */}
      <Pane name="trip-points" pane="overlayPane" style={{ zIndex: paneZIndex.tripPoints }}>
        {points.map((point, i) => (
          <PointDot
            key={`point-${i}`}
            at={point}
            selected={i === selectedPoint}
            numbered={isPointNumbered(i, points.length, selectedPoint, zoom)}
          />
        ))}
      </Pane>
      {/* Their numbers, the one the point card shows, on the badges (prototype/point-numbers). */}
      <Pane name="trip-point-numbers" pane="overlayPane" style={{ zIndex: paneZIndex.tripPointNumbers }}>
        {points.map(
          (point, i) =>
            isPointNumbered(i, points.length, selectedPoint, zoom) && (
              <Marker
                key={`point-number-${i}`}
                position={point}
                icon={pointNumberIcon(i + 1, i === selectedPoint)}
                interactive={false}
                keyboard={false}
              />
            ),
        )}
      </Pane>
      {/* Their hit areas sit above the access-point markers (Leaflet's marker pane is 600), so a
          route point that is also an access point can still be selected and dragged (#120). */}
      <Pane name="trip-point-hits" style={{ zIndex: paneZIndex.tripPointHits }}>
        {!frozen && points.map((point, i) => <PointHitArea key={`hit-${i}`} at={point} handlers={handlers(i)} />)}
      </Pane>
    </>
  );
}
