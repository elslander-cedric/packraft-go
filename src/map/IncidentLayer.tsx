"use client";

// The SPW's incidents on the map (ADR 0035, #216): an amber disc with a warning sign in it,
// unlike the dark diamonds of the obstacles, as these are temporary. Read-only: a tap only
// opens the details. Only loaded through AccessLayer.
import { divIcon } from "leaflet";
import { useMemo } from "react";
import { Marker } from "react-leaflet";
import { incidentText, type Incident } from "@/core/incident";
import { icons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import { strings } from "@/ui/strings";
import { escapeAttribute, escapeText } from "./escapeHtml";
import { HIT_SIZE_PX } from "./pressDrag";
import "./IncidentLayer.css";

const GLYPH = { x: 6, y: 6, width: 12, height: 12 };
const SIZE = 26;

function incidentIcon(incident: Incident) {
  const label = strings.incidents.marker(incidentText(incident) ?? strings.incidents.noText);
  return divIcon({
    className: `incident-marker incident-${incident.spwId}`,
    html:
      `<svg role="img" aria-label="${escapeAttribute(label)}" viewBox="0 0 24 24" width="${SIZE}" height="${SIZE}">` +
      `<title>${escapeText(label)}</title>` +
      `<circle cx="12" cy="12" r="11" fill="#f5a623" stroke="#fff" stroke-width="2"/>` +
      `<g color="#1a1a1a">${iconSvg(icons.incident, GLYPH)}</g></svg>`,
    iconSize: [HIT_SIZE_PX, HIT_SIZE_PX],
    iconAnchor: [HIT_SIZE_PX / 2, HIT_SIZE_PX / 2],
  });
}

function IncidentMarker({ incident, onSelect }: { incident: Incident; onSelect: () => void }) {
  const icon = useMemo(() => incidentIcon(incident), [incident]);
  const [lng, lat] = incident.position;
  return <Marker position={[lat, lng]} icon={icon} eventHandlers={{ click: onSelect }} />;
}

export type IncidentLayerProps = {
  incidents: readonly Incident[];
  onSelect: (id: string) => void;
};

/** Every incident at any zoom, each a finger-sized target: they are few and time-sensitive. */
export default function IncidentLayer({ incidents, onSelect }: IncidentLayerProps) {
  return incidents.map((incident) => (
    <IncidentMarker key={incident.id} incident={incident} onSelect={() => onSelect(incident.id)} />
  ));
}
