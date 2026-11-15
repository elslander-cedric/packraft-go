// Builds the route network for suggested trips (ADR 0039) from the Walloon stretch records,
// their OSM ways, the official aires, the obstacles and the locks. Pure: the script
// (scripts/prepare-route-network.mts) fetches and caches the OSM answers.
import type { AccessSource } from "@/core/access";
import type { CalendarDate } from "@/core/calendarDate";
import type { Position } from "@/core/geo";
import type { AccessPointUse } from "@/core/accessPoints";
import { ROUTE_NETWORK_FORMAT, ROUTE_NETWORK_VERSION, type PaddleLink, type RouteNetwork, type RouteNode } from "@/core/routeNetwork";
import { distanceM, project } from "../walloonStretches/geo";
import type { OverpassResult } from "../walloonStretches/overpass";
import { orientRecord, toPt } from "./direction";
import { bankNetwork, type BankInputs } from "./banks";
import { paddleLinks, type BrokenLink, type PreparedRecord, type Station } from "./links";
import { markersOnRecord, type MarkerInput, type ObstacleInput } from "./markers";

/** How far from a record's line an aire may be and still be on its water: aires sit on the bank, some by a car park. */
export const AIRE_ON_WATER_M = 150;
/** How close one record's end and the next one's start must be for its water to run into the next. */
const JOIN_M = 100;
/** A record whose OSM ways run this far both with and against its line is reported. */
const DISAGREEMENT_M = 50;

export type NetworkRecord = { readonly id: string; readonly river: string; readonly line: readonly Position[] };

export type NetworkInputs = {
  readonly records: readonly NetworkRecord[];
  /** The Overpass answer for each record, by record id (`recordQuery`). */
  readonly osm: Readonly<Record<string, OverpassResult>>;
  readonly aires: readonly (MarkerInput & { readonly use: AccessPointUse })[];
  readonly obstacles: readonly ObstacleInput[];
  readonly locks: readonly MarkerInput[];
  readonly sources: readonly AccessSource[];
  readonly snapshot: CalendarDate;
  /** Outside Wallonia: the waters and paths for bank spots. Without it, the network has none. */
  readonly banks?: BankInputs;
};

/** What the maintainer should look at before shipping the network. */
export type NetworkReport = {
  /** Records whose OSM ways disagree on the direction of flow; the longer side wins. */
  readonly disagreeing: readonly { record: string; river: string; withM: number; againstM: number }[];
  /** Records with no OSM way along them: no links on them. */
  readonly withoutOsm: readonly string[];
  /** Aires on no record's water: nodes without links. */
  readonly airesOffWater: readonly string[];
  /** Neighbouring nodes with a barrier between them. */
  readonly broken: readonly BrokenLink[];
  /** Links between bank spots dropped because part of their water has no access rule (outside Belgium). */
  readonly unruled: readonly string[];
};

export const ROUTE_NETWORK_TITLE = "Route network for suggested trips";
export const ROUTE_NETWORK_ATTRIBUTION =
  "Geometry © OpenStreetMap contributors, ODbL; Sources des données : Service public de Wallonie";

function prepareRecords(inputs: NetworkInputs) {
  const disagreeing: NetworkReport["disagreeing"][number][] = [];
  const withoutOsm: string[] = [];
  const oriented = inputs.records.flatMap((record) => {
    const osm = inputs.osm[record.id] ?? { elements: [] };
    const orientation = orientRecord(record.line, osm);
    if (!orientation) {
      withoutOsm.push(record.id);
      return [];
    }
    const { withM, againstM } = orientation;
    if (Math.min(withM, againstM) >= DISAGREEMENT_M) {
      disagreeing.push({ record: record.id, river: record.river, withM: Math.round(withM), againstM: Math.round(againstM) });
    }
    const markers = markersOnRecord(orientation.line, { osm, obstacles: inputs.obstacles, locks: inputs.locks });
    return [{ id: record.id, river: record.river, line: orientation.line, canal: orientation.canal, markers }];
  });
  const records: PreparedRecord[] = oriented.map((record) => ({
    ...record,
    next: oriented.find(
      (other) => other !== record && distanceM(record.line[record.line.length - 1], other.line[0]) <= JOIN_M,
    )?.id,
  }));
  return { records, disagreeing, withoutOsm };
}

/**
 * Where each aire lies on the records' waters. Near a join, an aire on one record is also
 * near the end of the other; it is placed on the nearer of the two only. An aire at a
 * confluence where no record joins stays on both waters.
 */
function stationsOf(aires: NetworkInputs["aires"], records: readonly PreparedRecord[]): Station[] {
  return aires.flatMap((aire) => {
    const near = records.flatMap((record) => {
      const { along, distance } = project(record.line, toPt(aire.position));
      return distance <= AIRE_ON_WATER_M ? [{ record, alongM: along, offM: distance }] : [];
    });
    const joined = (a: (typeof near)[number], b: (typeof near)[number]) =>
      a.record.next === b.record.id || b.record.next === a.record.id;
    return near
      .filter((here) => !near.some((other) => joined(here, other) && other.offM < here.offM))
      .map(({ record, alongM }) => ({ node: aire.id, record: record.id, alongM }));
  });
}

export function buildRouteNetwork(inputs: NetworkInputs): { network: RouteNetwork; report: NetworkReport } {
  const { records, disagreeing, withoutOsm } = prepareRecords(inputs);
  const stations = stationsOf(inputs.aires, records);
  const { links, broken } = paddleLinks(records, stations);
  const nodes: RouteNode[] = inputs.aires.map((aire) => ({
    id: aire.id,
    kind: "official-aire",
    use: aire.use,
    position: aire.position,
  }));
  const onWater = new Set(stations.map((station) => station.node));
  const banks = inputs.banks
    ? bankNetwork(inputs.banks, inputs)
    : { nodes: [], links: [], broken: [], unruled: [] };
  const byEnds = (a: PaddleLink, b: PaddleLink) =>
    `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`, "en", { numeric: true });
  return {
    network: {
      format: ROUTE_NETWORK_FORMAT,
      version: ROUTE_NETWORK_VERSION,
      title: ROUTE_NETWORK_TITLE,
      attribution: ROUTE_NETWORK_ATTRIBUTION,
      sources: inputs.sources,
      snapshot: inputs.snapshot,
      nodes: [...nodes, ...banks.nodes],
      paddleLinks: [...links, ...banks.links].sort(byEnds),
    },
    report: {
      disagreeing,
      withoutOsm,
      airesOffWater: inputs.aires.filter((aire) => !onWater.has(aire.id)).map((aire) => aire.id),
      broken: [...broken, ...banks.broken],
      unruled: banks.unruled,
    },
  };
}
