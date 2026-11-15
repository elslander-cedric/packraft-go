// What lies on a record's water, as distances along its oriented line: the barriers that
// end a paddle link (a dam, an impassable obstacle or a lock; ADR 0039) and the obstacles a
// link only warns about (rocks, drossage, low bridges).
import type { Position } from "@/core/geo";
import { PASSING_TOLERANCE_M } from "@/core/locks";
import type { ObstacleKind } from "@/core/obstacle";
import { crossings, project, type Pt } from "../walloonStretches/geo";
import type { OverpassElement, OverpassResult } from "../walloonStretches/overpass";
import { toPt } from "./direction";

/** How close to the line a dam or lock gate mapped in OSM must be: OSM draws them on the water. */
const OSM_ON_LINE_M = 30;

const BARRIER_KINDS: readonly ObstacleKind[] = ["dam", "impassable"];

export type MarkerInput = { readonly id: string; readonly position: Position };
export type ObstacleInput = MarkerInput & { readonly kind: ObstacleKind };

/** A barrier or obstacle on the line: `id` names it in the report or the link. */
export type Marker = { readonly id: string; readonly alongM: number };

export type RecordMarkers = { readonly barriers: readonly Marker[]; readonly obstacles: readonly Marker[] };

function near(line: readonly Pt[], markers: readonly MarkerInput[], withinM: number): Marker[] {
  return markers.flatMap(({ id, position }) => {
    const { along, distance } = project(line, toPt(position));
    return distance <= withinM ? [{ id, alongM: along }] : [];
  });
}

/** Where an OSM dam or lock gate meets the line: where a way crosses it, or a node on it. */
function osmBarrier(line: readonly Pt[], element: OverpassElement): Marker[] {
  const id = `osm-${element.type}-${element.id}`;
  if (element.type === "node" && element.lat !== undefined && element.lon !== undefined) {
    return near(line, [{ id, position: [element.lon, element.lat] }], OSM_ON_LINE_M);
  }
  const points = (element.geometry ?? []).flatMap((point) => (point ? [{ lat: point.lat, lng: point.lon }] : []));
  const crossing = crossings(line, points)[0];
  if (crossing) {
    return [{ id, alongM: crossing.along }];
  }
  const nearest = points.map((point) => project(line, point)).sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance <= OSM_ON_LINE_M ? [{ id, alongM: nearest.along }] : [];
}

const isOsmBarrier = (element: OverpassElement) => ["dam", "lock_gate"].includes(element.tags?.waterway ?? "");

export function markersOnRecord(
  line: readonly Pt[],
  inputs: { osm: OverpassResult; obstacles: readonly ObstacleInput[]; locks: readonly MarkerInput[] },
): RecordMarkers {
  const isBarrier = (obstacle: ObstacleInput) => BARRIER_KINDS.includes(obstacle.kind);
  return {
    barriers: [
      ...near(line, inputs.obstacles.filter(isBarrier), PASSING_TOLERANCE_M),
      ...near(line, inputs.locks, PASSING_TOLERANCE_M),
      ...inputs.osm.elements.filter(isOsmBarrier).flatMap((element) => osmBarrier(line, element)),
    ],
    obstacles: near(
      line,
      inputs.obstacles.filter((obstacle) => !isBarrier(obstacle)),
      PASSING_TOLERANCE_M,
    ),
  };
}
