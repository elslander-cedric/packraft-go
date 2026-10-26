"use client";

// Your access points on the map (#55, ADR 0023): one marker each, coloured by
// use and shaped by kind. Click a marker to select it; drag it to move it.
// Its own layer, apart from the trip's, and only loaded through TripMap and PhoneMap.
import type { Marker as LeafletMarker } from "leaflet";
import { divIcon } from "leaflet";
import { useRef } from "react";
import { Marker } from "react-leaflet";
import type { AccessPoint, AccessPointKind, AccessPointUse, AccessPoints } from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";
import { strings } from "@/ui/strings";
import { HIT_SIZE_PX, usePressDrag } from "./pressDrag";
import "./AccessPointLayer.css";

export type AccessPointLayerProps = {
  points: AccessPoints;
  /** The id of the selected access point, if any. */
  selectedId: string | null;
  /** The planner clicked an access point's marker. */
  onSelect: (id: string) => void;
  /** The planner dragged an access point's marker and dropped it at `to`. */
  onMove: (id: string, to: LatLng) => void;
  /**
   * Move markers with the phone's press-and-drag (#120) on 44 px hit areas,
   * instead of Leaflet's marker drag, which a finger can't use on a phone.
   */
  pressDrag?: boolean;
};

// Put-ins and take-outs share the colours of the trip's put-in and take-out rings.
const useColour: Record<AccessPointUse, string> = {
  "put-in": "#1a8f3a",
  "take-out": "#7a3fb5",
  both: "#0e7c86",
};

// Each kind has its own shape, in a 24 × 24 box.
const kindShape: Record<AccessPointKind, (fill: string) => string> = {
  "official-aire": (fill) => `<rect x="3" y="3" width="18" height="18" rx="2" fill="${fill}"/>`,
  slipway: (fill) => `<path d="M12 1 L23 12 L12 23 L1 12 Z" fill="${fill}"/>`,
  jetty: (fill) => `<path d="M12 2 L22.5 21 H1.5 Z" fill="${fill}"/>`,
  "informal-bank": (fill) => `<circle cx="12" cy="12" r="10" fill="${fill}"/>`,
};

const SIZE = 24;

// Icons are shared and kept: a new icon replaces the marker's element, which would interrupt a drag.
const icons = new Map<string, ReturnType<typeof divIcon>>();

/** `fingerSized`: drawn in a 44 px hit box, for press-and-drag (#120). */
function accessPointIcon({ use, kind }: AccessPoint, selected: boolean, fingerSized: boolean) {
  const key = `${use}|${kind}|${selected}|${fingerSized}`;
  const known = icons.get(key);
  if (known) return known;
  const label = strings.accessPoints.marker(strings.accessPoints.uses[use], strings.accessPoints.kinds[kind]);
  const icon = divIcon({
    className: `access-point-marker use-${use} kind-${kind}${selected ? " access-point-selected" : ""}${fingerSized ? " access-point-hit" : ""}`,
    html:
      `<svg role="img" aria-label=${JSON.stringify(label)} viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
      `<g stroke="#fff" stroke-width="2" stroke-linejoin="round">${kindShape[kind](useColour[use])}</g></svg>`,
    iconSize: fingerSized ? [HIT_SIZE_PX, HIT_SIZE_PX] : [SIZE, SIZE],
    iconAnchor: fingerSized ? [HIT_SIZE_PX / 2, HIT_SIZE_PX / 2] : [SIZE / 2, SIZE / 2],
  });
  icons.set(key, icon);
  return icon;
}

/** A marker moved with press-and-drag: drawn under the finger while dragged, moved when let go. */
function PressDragMarker({
  point,
  selected,
  onSelect,
  onMove,
}: { point: AccessPoint; selected: boolean } & Pick<AccessPointLayerProps, "onSelect" | "onMove">) {
  const marker = useRef<LeafletMarker>(null);
  const icon = accessPointIcon(point, selected, true);
  usePressDrag(
    marker,
    {
      onTap: () => onSelect(point.id),
      onDrag: (to) => marker.current?.setLatLng(to),
      onDrop: (to) => onMove(point.id, to),
      onCancel: () => marker.current?.setLatLng(point.position),
    },
    // A new icon replaces the marker's element, so listen again.
    [icon],
  );
  return <Marker ref={marker} position={point.position} icon={icon} />;
}

export default function AccessPointLayer({
  points,
  selectedId,
  onSelect,
  onMove,
  pressDrag = false,
}: AccessPointLayerProps) {
  if (pressDrag) {
    return (
      <>
        {points.map((point) => (
          <PressDragMarker
            key={point.id}
            point={point}
            selected={point.id === selectedId}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {points.map((point) => (
        <Marker
          key={point.id}
          position={point.position}
          icon={accessPointIcon(point, point.id === selectedId, false)}
          draggable
          eventHandlers={{
            click: () => onSelect(point.id),
            dragend: (event) => {
              const { lat, lng } = (event.target as LeafletMarker).getLatLng();
              onMove(point.id, { lat, lng });
            },
          }}
        />
      ))}
    </>
  );
}
