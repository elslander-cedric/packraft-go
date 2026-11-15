// Paddle links (ADR 0039): from each node, along its water in the direction it flows to the
// next node, carrying on into the next record where one record's water runs into another's.
// A link that would pass a barrier is not made; the report lists it.
import type { Position } from "@/core/geo";
import type { PaddleLink } from "@/core/routeNetwork";
import { lengthM, slice, simplify, type Pt } from "../walloonStretches/geo";
import type { RecordMarkers } from "./markers";

/** Simplification of a link's line, in metres, as for the official stretch lines. */
const LINE_TOLERANCE_M = 3;

export type PreparedRecord = {
  readonly id: string;
  readonly river: string;
  /** In the direction the water flows. */
  readonly line: readonly Pt[];
  readonly canal: boolean;
  readonly markers: RecordMarkers;
  /** The record this one's water runs into, end to start. */
  readonly next?: string;
};

/** A node where it lies on a record's water. */
export type Station = { readonly node: string; readonly record: string; readonly alongM: number };

/** Part of a link on one record. A bound at a join between records counts as on the piece. */
type Piece = {
  readonly record: PreparedRecord;
  readonly fromM: number;
  readonly toM: number;
  readonly fromJoin: boolean;
  readonly toJoin: boolean;
};

export type BrokenLink = { readonly from: string; readonly to: string; readonly barrier: string };

const roundPosition = ({ lng, lat }: Pt): Position => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];

const onPiece = (alongM: number, piece: Piece) =>
  (piece.fromJoin ? alongM >= piece.fromM : alongM > piece.fromM) &&
  (piece.toJoin ? alongM <= piece.toM : alongM < piece.toM);

/** The pieces from `start` to the next node downstream, and that node's station. */
function walk(start: Station, records: ReadonlyMap<string, PreparedRecord>, stations: readonly Station[]) {
  const pieces: Piece[] = [];
  const visited = new Set<string>();
  let record = records.get(start.record);
  let fromM = start.alongM;
  let fromJoin = false;
  while (record && !visited.has(record.id)) {
    visited.add(record.id);
    const current = record;
    const ahead = stations
      .filter((station) => station.record === current.id && station.node !== start.node)
      .filter((station) => (fromJoin ? station.alongM >= fromM : station.alongM > fromM))
      .sort((a, b) => a.alongM - b.alongM)[0];
    if (ahead) {
      pieces.push({ record: current, fromM, toM: ahead.alongM, fromJoin, toJoin: false });
      return { pieces, to: ahead };
    }
    pieces.push({ record: current, fromM, toM: lengthM(current.line), fromJoin, toJoin: true });
    record = current.next === undefined ? undefined : records.get(current.next);
    fromM = 0;
    fromJoin = true;
  }
  return undefined;
}

function link(from: string, to: string, pieces: readonly Piece[]): PaddleLink {
  const line = simplify(
    pieces.flatMap((piece, i) => slice(piece.record.line, piece.fromM, piece.toM).slice(i === 0 ? 0 : 1)),
    LINE_TOLERANCE_M,
  );
  return {
    from,
    to,
    direction: pieces.every((piece) => piece.record.canal) ? "both" : "downstream",
    distanceM: Math.round(pieces.reduce((sum, piece) => sum + piece.toM - piece.fromM, 0)),
    waters: [...new Set(pieces.map((piece) => piece.record.river))],
    records: pieces.map((piece) => piece.record.id),
    obstacles: pieces.flatMap((piece) =>
      piece.record.markers.obstacles
        .filter((marker) => onPiece(marker.alongM, piece))
        .sort((a, b) => a.alongM - b.alongM)
        .map((marker) => marker.id),
    ),
    line: line.map(roundPosition).filter((point, i, all) => i === 0 || point.join() !== all[i - 1].join()),
  };
}

const barrierOn = (pieces: readonly Piece[]) =>
  pieces.flatMap((piece) => piece.record.markers.barriers.filter((marker) => onPiece(marker.alongM, piece)))[0];

/** Every paddle link between stations next to each other, one per pair of nodes (the shortest). */
export function paddleLinks(records: readonly PreparedRecord[], stations: readonly Station[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const links = new Map<string, PaddleLink>();
  const broken = new Map<string, BrokenLink>();
  for (const start of stations) {
    const found = walk(start, byId, stations);
    if (!found) {
      continue;
    }
    const key = `${start.node}>${found.to.node}`;
    const barrier = barrierOn(found.pieces);
    if (barrier) {
      broken.set(key, { from: start.node, to: found.to.node, barrier: barrier.id });
      continue;
    }
    const made = link(start.node, found.to.node, found.pieces);
    const known = links.get(key);
    if (!known || made.distanceM < known.distanceM) {
      links.set(key, made);
    }
  }
  // Sorted, so a refresh of the network reads well as a diff.
  const sorted = [...links.entries()].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  return {
    links: sorted.map(([, made]) => made),
    broken: [...broken.entries()].filter(([key]) => !links.has(key)).map(([, brokenLink]) => brokenLink),
  };
}
