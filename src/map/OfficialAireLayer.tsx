"use client";

// The SPW's official aires on the map (ADR 0035): a hexagon coloured by use with an
// arrow in it, unlike your own access points. Read-only: a tap only opens the details.
// Only loaded through AccessLayer.
import { divIcon } from "leaflet";
import { useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import type { AccessPointUse } from "@/core/accessPoints";
import type { OfficialAire } from "@/core/officialAire";
import { icons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import { strings } from "@/ui/strings";
import { accessUseColours } from "./accessColours";
import { escapeAttribute, escapeText } from "./escapeHtml";
import { aireFullMarkersMinZoom } from "./mapConfig";
import { HIT_SIZE_PX } from "./pressDrag";
import "./OfficialAireLayer.css";

const HEXAGON = "M12 1 L22 6.5 V17.5 L12 23 L2 17.5 V6.5 Z";
const ARROW = { x: 7, y: 7, width: 10, height: 10 };
const FULL_SIZE = 24;
const SMALL_SIZE = 12;

const arrows: Record<AccessPointUse, typeof icons.airePutIn> = {
  "put-in": icons.airePutIn,
  "take-out": icons.aireTakeOut,
  both: icons.aireBoth,
};

function aireIcon(aire: OfficialAire, small: boolean) {
  const label = strings.officialAires.marker(aire.name, strings.accessPoints.uses[aire.use]);
  const size = small ? SMALL_SIZE : FULL_SIZE;
  const box = small ? SMALL_SIZE : HIT_SIZE_PX;
  return divIcon({
    className: `official-aire-marker use-${aire.use} official-aire-${aire.number}`,
    html:
      `<svg role="img" aria-label="${escapeAttribute(label)}" viewBox="0 0 24 24" width="${size}" height="${size}">` +
      `<title>${escapeText(label)}</title>` +
      `<path d="${HEXAGON}" fill="${accessUseColours[aire.use]}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
      `<g color="#fff">${iconSvg(arrows[aire.use], ARROW)}</g></svg>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
}

function AireMarker({ aire, small, onSelect }: { aire: OfficialAire; small: boolean; onSelect: () => void }) {
  const icon = useMemo(() => aireIcon(aire, small), [aire, small]);
  const [lng, lat] = aire.position;
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

export type OfficialAireLayerProps = {
  aires: readonly OfficialAire[];
  onSelect: (id: string) => void;
};

/**
 * Every aire at any zoom. Further out they are small and only show where the aires
 * are: at finger size they would cover the rivers, and a tap on a river would open
 * an aire instead of planning. Zoomed in, each is a finger-sized target.
 */
export default function OfficialAireLayer({ aires, onSelect }: OfficialAireLayerProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const small = zoom < aireFullMarkersMinZoom;
  return aires.map((aire) => <AireMarker key={aire.id} aire={aire} small={small} onSelect={() => onSelect(aire.id)} />);
}
