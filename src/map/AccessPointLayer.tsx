"use client";

// Your access points on the map (#55, ADR 0023): one marker each, coloured by
// use and shaped by kind, with a white flag in it (ADR 0028). Tap a marker
// to select it; press and drag it to move it (#120).
// Its own layer, apart from the trip's, and only loaded through TripMap.
import type { Marker as LeafletMarker } from "leaflet";
import { divIcon } from "leaflet";
import { useRef } from "react";
import { Marker } from "react-leaflet";
import type { AccessPoint, AccessPointKind, AccessPointUse, AccessPoints } from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";
import { accessPointText } from "@/ui/accessPointText";
import { icons } from "@/ui/icons/icons";
import { iconSvg, type IconPlacement } from "@/ui/icons/iconSvg";
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

// The flag sits in the widest part of each shape: lower in the triangle.
const flagPlacement: Record<AccessPointKind, IconPlacement> = {
  "official-aire": { x: 7, y: 7, width: 10, height: 10 },
  slipway: { x: 7.5, y: 7.5, width: 9, height: 9 },
  jetty: { x: 8, y: 11, width: 8, height: 8 },
  "informal-bank": { x: 7, y: 7, width: 10, height: 10 },
};

const SIZE = 24;

// Icons are shared and kept: a new icon replaces the marker's element, which would interrupt a drag.
const markerIcons = new Map<string, ReturnType<typeof divIcon>>();

// Names and notes are yours: escape them in the marker's HTML.
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, "&quot;");

/**
 * Drawn in a 44 px hit box, for press-and-drag (#120) instead of Leaflet's marker drag,
 * which a finger can't use.
 */
function accessPointIcon(point: AccessPoint, selected: boolean) {
  const { use, kind } = point;
  const { heading, detail } = accessPointText(point);
  const label = strings.accessPoints.marker(heading, detail);
  const key = `${use}|${kind}|${selected}|${label}`;
  const known = markerIcons.get(key);
  if (known) return known;
  // Labels follow names and notes as you type: don't keep every one.
  if (markerIcons.size > 200) markerIcons.clear();
  const icon = divIcon({
    className: `access-point-marker use-${use} kind-${kind}${selected ? " access-point-selected" : ""}`,
    html:
      `<svg role="img" aria-label="${escapeAttribute(label)}" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
      `<title>${escapeText(label)}</title>` +
      `<g stroke="#fff" stroke-width="2" stroke-linejoin="round">${kindShape[kind](useColour[use])}</g>` +
      `<g color="#fff">${iconSvg(icons.accessPoint, flagPlacement[kind])}</g></svg>`,
    iconSize: [HIT_SIZE_PX, HIT_SIZE_PX],
    iconAnchor: [HIT_SIZE_PX / 2, HIT_SIZE_PX / 2],
  });
  markerIcons.set(key, icon);
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
  const icon = accessPointIcon(point, selected);
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

export default function AccessPointLayer({ points, selectedId, onSelect, onMove }: AccessPointLayerProps) {
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
