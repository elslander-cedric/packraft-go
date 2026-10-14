// Lock markers from OpenStreetMap (#57): one marker per lock in Flanders and
// Brussels. Offline preparation only.
import type { LockMarker } from "@/core/access";
import { distanceM } from "@/core/geo";
import { insideAny, type OverpassResponse, type Polygon, roundPosition } from "./osm";

/** Lock chambers closer than this are one lock (parallel chambers, a lock and its by-pass). */
const SAME_LOCK_M = 150;

export type LockRegion = { readonly id: string; readonly area: readonly Polygon[] };

/** Lock chambers are ways tagged `lock=yes` on a waterway; the mapped water of a lock (natural=water) is not one. */
export const LOCK_QUERY = (bbox: string) => `way["lock"="yes"]["waterway"](${bbox});`;

type Candidate = { id: string; name: string; position: readonly [number, number] };

/**
 * One marker per lock, inside one of the regions (the first that contains it).
 * `source` and `researched` are filled in by the caller.
 */
export function lockMarkers(
  response: OverpassResponse,
  regions: readonly LockRegion[],
): Omit<LockMarker, "source" | "researched">[] {
  const candidates: Candidate[] = [];
  for (const element of [...response.elements].sort((a, b) => a.id - b.id)) {
    if (element.type !== "way" || element.tags?.lock !== "yes" || !element.tags.waterway) continue;
    const points = (element.geometry ?? []).filter((p): p is { lat: number; lon: number } => p !== null);
    if (points.length === 0) continue;
    const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const lng = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
    const tags = element.tags;
    candidates.push({
      id: `lock-way-${element.id}`,
      name: tags.lock_name ?? tags["lock_name:en"] ?? tags.name ?? "Lock",
      position: roundPosition([lng, lat]) as [number, number],
    });
  }

  const kept: (Candidate & { region: string })[] = [];
  for (const candidate of candidates) {
    const region = regions.find((r) => insideAny(r.area)(candidate.position));
    if (!region) continue;
    const twin = kept.find(
      (k) =>
        k.region === region.id &&
        distanceM({ lng: k.position[0], lat: k.position[1] }, { lng: candidate.position[0], lat: candidate.position[1] }) <
          SAME_LOCK_M,
    );
    if (!twin) kept.push({ ...candidate, region: region.id });
  }

  const regionOrder = (id: string) => regions.findIndex((r) => r.id === id);
  return kept
    .sort((a, b) => regionOrder(a.region) - regionOrder(b.region) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(({ id, name, region, position }) => ({ id, name, region, position }));
}
