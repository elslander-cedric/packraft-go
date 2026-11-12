"use client";

// Your access points on the map (ADR 0023): one marker each, shaped by
// kind, with a white flag in it (ADR 0028), grey in normal mode and green in
// access point editing (ADR 0036). While `editable`
// (access point editing, ADR 0036), tap a marker to select it; press and drag
// it to move it. Otherwise the markers are inert: a press passes
// through to the route point, leg or map under it, and the trip is drawn over
// them (their own pane below the legs). In normal mode, points whose markers would
// overlap at the current zoom show as one marker with their count (`accessPointGroups.ts`);
// while editing each keeps its own, to tap and drag. The new point placed while
// editing and not saved yet (the draft) has its own marker: drag it into place;
// a tap on it does nothing, as only the flag button opens its details.
// Its own layer, apart from the trip's, and only loaded through TripMap.
import type { Marker as LeafletMarker } from "leaflet";
import { divIcon } from "leaflet";
import { useMemo, useRef, useState } from "react";
import { Marker, Pane, useMap, useMapEvents } from "react-leaflet";
import type { AccessPoint, AccessPointKind, AccessPoints } from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";
import { accessPointText } from "@/ui/accessPointText";
import { icons } from "@/ui/icons/icons";
import { iconSvg, type IconPlacement } from "@/ui/icons/iconSvg";
import { strings } from "@/ui/strings";
import { accessPointModeColours } from "./accessColours";
import { groupNearby } from "./accessPointGroups";
import { paneZIndex } from "./mapConfig";
import { escapeAttribute, escapeText } from "./escapeHtml";
import { HIT_SIZE_PX, usePressDrag } from "./pressDrag";
import "./AccessPointLayer.css";

export type AccessPointLayerProps = {
  points: AccessPoints;
  /** Access point editing: the markers take taps and drags. Otherwise they don't react. */
  editable: boolean;
  /** The id of the selected access point, if any. */
  selectedId: string | null;
  /** The planner clicked an access point's marker. */
  onSelect: (id: string) => void;
  /** The planner dragged an access point's marker and dropped it at `to`. */
  onMove: (id: string, to: LatLng) => void;
  /** The new point placed on the map and not saved yet, if any. */
  draft?: AccessPoint | null;
  /** The planner dragged the new point's marker and dropped it at `to`. */
  onDraftMove?: (to: LatLng) => void;
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

/**
 * Drawn in a 44 px hit box, for press-and-drag instead of Leaflet's marker drag,
 * which a finger can't use.
 */
function accessPointIcon(point: AccessPoint, selected: boolean, editable: boolean, draft = false) {
  const { use, kind } = point;
  const { heading, detail } = accessPointText(point);
  const label = draft ? strings.accessPoints.draftMarker : strings.accessPoints.marker(heading, detail);
  const key = `${use}|${kind}|${selected}|${editable}|${draft}|${label}`;
  const known = markerIcons.get(key);
  if (known) {
    return known;
  }
  // Labels follow names and notes as you type: don't keep every one.
  if (markerIcons.size > 200) {
    markerIcons.clear();
  }
  const icon = divIcon({
    className:
      `access-point-marker use-${use} kind-${kind}` +
      `${editable ? " access-point-editable" : ""}${selected ? " access-point-selected" : ""}` +
      `${draft ? " access-point-draft" : ""}`,
    html:
      `<svg role="img" aria-label="${escapeAttribute(label)}" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
      `<title>${escapeText(label)}</title>` +
      `<g stroke="#fff" stroke-width="2" stroke-linejoin="round">${kindShape[kind](accessPointModeColours[editable ? "editing" : "normal"])}</g>` +
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
  draft = false,
  onSelect,
  onMove,
}: { point: AccessPoint; selected: boolean; draft?: boolean } & Pick<AccessPointLayerProps, "onSelect" | "onMove">) {
  const marker = useRef<LeafletMarker>(null);
  const icon = accessPointIcon(point, selected, true, draft);
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

const groupIcons = new Map<number, ReturnType<typeof divIcon>>();

/** Access points whose markers would overlap, shown as one grey circle with their count. */
function groupIcon(count: number) {
  const known = groupIcons.get(count);
  if (known) {
    return known;
  }
  const label = strings.accessPoints.groupMarker(count);
  const icon = divIcon({
    className: "access-point-marker access-point-group",
    html:
      `<svg role="img" aria-label="${escapeAttribute(label)}" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
      `<title>${escapeText(label)}</title>` +
      `<circle cx="12" cy="12" r="11" fill="${accessPointModeColours.normal}" stroke="#fff" stroke-width="2"/>` +
      `<text x="12" y="12" dy="0.35em" text-anchor="middle" fill="#fff" font-size="${count > 99 ? 8 : 11}" font-weight="700">${count}</text></svg>`,
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
  });
  groupIcons.set(count, icon);
  return icon;
}

/** Inert like the single markers, at the middle of its members. */
function GroupMarker({ members }: { members: AccessPoint[] }) {
  const lat = members.reduce((sum, member) => sum + member.position.lat, 0) / members.length;
  const lng = members.reduce((sum, member) => sum + member.position.lng, 0) / members.length;
  return <Marker position={{ lat, lng }} icon={groupIcon(members.length)} interactive={false} keyboard={false} />;
}

/**
 * Normal mode: points whose markers would overlap at the current zoom are grouped (the selected one
 * never is), so zoomed out they don't pile up. Regrouped when the zoom changes.
 */
function InertMarkers({ points, selectedId }: { points: AccessPoints; selectedId: string | null }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const groups = useMemo(
    () =>
      groupNearby(
        points
          .filter((point) => point.id !== selectedId)
          .map((point) => ({ item: point, ...map.project(point.position, zoom) })),
      ),
    [points, selectedId, map, zoom],
  );
  const selected = points.find((point) => point.id === selectedId);
  return (
    <>
      {groups.map((members) =>
        members.length === 1 ? (
          <InertMarker key={members[0].id} point={members[0]} selected={false} />
        ) : (
          <GroupMarker key={`group-${members[0].id}`} members={members} />
        ),
      )}
      {selected && <InertMarker key={selected.id} point={selected} selected />}
    </>
  );
}

/** A marker that doesn't react: not interactive (no pointer events), not focusable. */
function InertMarker({ point, selected }: { point: AccessPoint; selected: boolean }) {
  return (
    <Marker
      position={point.position}
      icon={accessPointIcon(point, selected, false)}
      interactive={false}
      keyboard={false}
    />
  );
}

export default function AccessPointLayer({
  points,
  editable,
  selectedId,
  onSelect,
  onMove,
  draft,
  onDraftMove,
}: AccessPointLayerProps) {
  // Leaflet reads `interactive` and `pane` only when it adds a marker: a change of mode remounts them.
  // While editing they are in Leaflet's marker pane, over the trip; otherwise in their own pane below it.
  return (
    <>
      {editable ? (
        points.map((point) => (
          <PressDragMarker
            key={point.id}
            point={point}
            selected={point.id === selectedId}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))
      ) : (
        <Pane name="access-points" pane="overlayPane" style={{ zIndex: paneZIndex.accessPoints }}>
          <InertMarkers points={points} selectedId={selectedId} />
        </Pane>
      )}
      {draft && (
        <PressDragMarker
          key={draft.id}
          point={draft}
          selected={false}
          draft
          onSelect={() => {}}
          onMove={(_, to) => onDraftMove?.(to)}
        />
      )}
    </>
  );
}
