// The route network outside Wallonia (ADR 0039): bank spots as nodes, and the paddle links
// between them along the OSM rivers and canals, with the access records of the water they
// paddle (the region's, a VMM agreement stretch's, the Brussels canal's).
import { recordsAt, type AccessRules } from "@/core/access";
import { samplesAlong, type Position } from "@/core/geo";
import type { PaddleLink, RouteNode } from "@/core/routeNetwork";
import type { Pt } from "../walloonStretches/geo";
import type { OverpassElement, OverpassResult } from "../walloonStretches/overpass";
import { pickBankSpots } from "./bankSpots";
import { toPt } from "./direction";
import { paddleLinks, type BrokenLink, type PreparedRecord } from "./links";
import { isOsmBarrier, markersOnRecord, type MarkerInput, type ObstacleInput } from "./markers";
import { watersFromOsm } from "./waters";

export type BankInputs = {
  /** The Overpass answers for every tile (`bankWaterQuery` and `bankPathQuery`), as one. */
  readonly osm: OverpassResult;
  readonly rules: AccessRules;
};

/** How far apart a link's line is checked for the access records it paddles, in metres. */
const SAMPLE_STEP_M = 50;
/** Markers further than this from a water's box, in degrees (about 200 m), can't be on it. */
const NEAR_DEG = 0.002;

const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

function nearBox(line: readonly Pt[]) {
  const lats = line.map((point) => point.lat);
  const lngs = line.map((point) => point.lng);
  const [south, north] = [Math.min(...lats) - NEAR_DEG, Math.max(...lats) + NEAR_DEG];
  const [west, east] = [Math.min(...lngs) - NEAR_DEG, Math.max(...lngs) + NEAR_DEG];
  return ({ lat, lng }: Pt) => lat >= south && lat <= north && lng >= west && lng <= east;
}

const elementPoints = (element: OverpassElement): Pt[] =>
  element.lat !== undefined && element.lon !== undefined
    ? [{ lat: element.lat, lng: element.lon }]
    : (element.geometry ?? []).flatMap((point) => (point ? [{ lat: point.lat, lng: point.lon }] : []));

/** The access records along a line, in the order it meets them; undefined where a part of it has none. */
function recordsAlong(line: readonly Position[], rules: AccessRules): string[] | undefined {
  const ids: string[] = [];
  for (const point of samplesAlong(line.map(toPt), SAMPLE_STEP_M)) {
    const here = recordsAt(point, rules);
    if (here.length === 0) return undefined;
    for (const record of here) if (!ids.includes(record.id)) ids.push(record.id);
  }
  return ids;
}

export function bankNetwork(
  { osm, rules }: BankInputs,
  markers: { readonly obstacles: readonly ObstacleInput[]; readonly locks: readonly MarkerInput[] },
) {
  const waters = watersFromOsm(osm);
  const spots = pickBankSpots(waters, osm, rules);
  const barriers = [...new Map(osm.elements.filter(isOsmBarrier).map((element) => [`${element.type}${element.id}`, element])).values()];
  const records: PreparedRecord[] = waters.map((water) => {
    const near = nearBox(water.line);
    return {
      ...water,
      markers: markersOnRecord(water.line, {
        osm: { elements: barriers.filter((barrier) => elementPoints(barrier).some(near)) },
        obstacles: markers.obstacles.filter((obstacle) => near(toPt(obstacle.position))),
        locks: markers.locks.filter((lock) => near(toPt(lock.position))),
      }),
    };
  });
  const stations = spots.flatMap((spot) =>
    spot.stations.map((station) => ({ node: spot.id, record: station.water, alongM: station.alongM })),
  );
  const found = paddleLinks(records, stations);
  const unruled: string[] = [];
  const reverseOf = (link: { from: string; to: string }, all: readonly { from: string; to: string }[]) =>
    byId(link.from, link.to) > 0 && all.some((other) => other.from === link.to && other.to === link.from);
  const links: PaddleLink[] = found.links.flatMap((link) => {
    // A canal is paddled either way: one link per pair is enough.
    if (link.direction === "both" && reverseOf(link, found.links)) return [];
    const along = recordsAlong(link.line, rules);
    if (!along) {
      unruled.push(`${link.from} -> ${link.to}`);
      return [];
    }
    return [{ ...link, records: along }];
  });
  const nodes: RouteNode[] = spots.map((spot) => ({ id: spot.id, kind: "bank-spot", use: "both", position: spot.position }));
  const broken: BrokenLink[] = found.broken.filter((link) => !reverseOf(link, found.broken));
  return { nodes, links, broken, unruled };
}
