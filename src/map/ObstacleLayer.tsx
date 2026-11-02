"use client";

// The SPW's obstacles on the map (ADR 0035): a dark diamond with the kind's icon in it,
// like a road sign. Read-only: a tap only opens the details. Only loaded through AccessLayer.
import { divIcon } from "leaflet";
import { useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import type { Obstacle } from "@/core/obstacle";
import { obstacleIcons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import { strings } from "@/ui/strings";
import { escapeAttribute, escapeText } from "./escapeHtml";
import { lockMarkersMinZoom, obstacleFullMarkersMinZoom } from "./mapConfig";
import { HIT_SIZE_PX } from "./pressDrag";
import "./ObstacleLayer.css";

const DIAMOND = "M12 1 L23 12 L12 23 L1 12 Z";
const GLYPH = { x: 7, y: 7, width: 10, height: 10 };
const FULL_SIZE = 26;
const SMALL_SIZE = 14;

function obstacleIcon(obstacle: Obstacle, small: boolean) {
  const label = strings.obstacles.marker(strings.obstacles.names[obstacle.kind]);
  const size = small ? SMALL_SIZE : FULL_SIZE;
  const box = small ? SMALL_SIZE : HIT_SIZE_PX;
  return divIcon({
    className: `obstacle-marker kind-${obstacle.kind} obstacle-${obstacle.spwId}`,
    html:
      `<svg role="img" aria-label="${escapeAttribute(label)}" viewBox="0 0 24 24" width="${size}" height="${size}">` +
      `<title>${escapeText(label)}</title>` +
      `<path d="${DIAMOND}" fill="#1a1a1a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
      `<g color="#fff">${iconSvg(obstacleIcons[obstacle.kind], GLYPH)}</g></svg>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
}

function ObstacleMarker({ obstacle, small, onSelect }: { obstacle: Obstacle; small: boolean; onSelect: () => void }) {
  const icon = useMemo(() => obstacleIcon(obstacle, small), [obstacle, small]);
  const [lng, lat] = obstacle.position;
  // Leaflet reads `interactive` only when a marker is created: the key makes a new one.
  return (
    <Marker
      key={String(small)}
      position={[lat, lng]}
      icon={icon}
      interactive={!small}
      keyboard={!small}
      eventHandlers={{ click: onSelect }}
    />
  );
}

export type ObstacleLayerProps = {
  obstacles: readonly Obstacle[];
  onSelect: (id: string) => void;
};

/**
 * The obstacles, from the same zoom as locks. Like the aires, they sit on the rivers, so
 * at first they are small and only show the place; further in each is a finger-sized target.
 */
export default function ObstacleLayer({ obstacles, onSelect }: ObstacleLayerProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (zoom < lockMarkersMinZoom) return null;
  const small = zoom < obstacleFullMarkersMinZoom;
  return obstacles.map((obstacle) => (
    <ObstacleMarker key={obstacle.id} obstacle={obstacle} small={small} onSelect={() => onSelect(obstacle.id)} />
  ));
}
