// The route network for suggested trips (ADR 0039, GLOSSARY "Route network"): the places
// a suggested trip may get in or out (its nodes) and the paddle and walking links between them,
// prepared offline and shipped with the app. Read-only; the search never changes it.
import type { AccessSource } from "./access";
import type { CalendarDate } from "./calendarDate";
import type { Position } from "./geo";
import type { AccessPointUse } from "./accessPoints";

export const ROUTE_NETWORK_FORMAT = "packraft-go/route-network";
export const ROUTE_NETWORK_VERSION = 1;

/** `bank-spot`: outside Wallonia, where a path or road reaches the bank (GLOSSARY "Bank spot"). */
export const routeNodeKinds = ["official-aire", "bank-spot"] as const;
export type RouteNodeKind = (typeof routeNodeKinds)[number];

/** A place a suggested trip may get in or out. */
export type RouteNode = {
  /** For an official aire, the aire's own id (`official-aire-<number>`); for a bank spot, `bank-spot-<OSM node id>`. */
  readonly id: string;
  readonly kind: RouteNodeKind;
  readonly use: AccessPointUse;
  readonly position: Position;
};

/**
 * `downstream`: a river, paddled only from `from` to `to`, which is the way it flows.
 * `both`: a canal or still water, paddled either way.
 */
export const paddleDirections = ["downstream", "both"] as const;
export type PaddleDirection = (typeof paddleDirections)[number];

/**
 * A stretch of water between two nodes next to each other along it, with no dam,
 * impassable obstacle or lock on the way.
 */
export type PaddleLink = {
  readonly from: string;
  readonly to: string;
  readonly direction: PaddleDirection;
  /** Along the water, in metres. */
  readonly distanceM: number;
  /** The rivers it paddles, in order, e.g. ["Warche", "Amblève"]. */
  readonly waters: readonly string[];
  /** The access records the link paddles, in the order it meets them (e.g. `walloon-1A2`). */
  readonly records: readonly string[];
  /** The obstacles it passes (rocks, drossage, low bridges), in the order it meets them, by id. */
  readonly obstacles: readonly string[];
  /** From `from` to `to`, simplified and rounded. */
  readonly line: readonly Position[];
};

/**
 * A walk along paths between two nodes, routed preferring waymarked trails, at most about
 * 15 km. Either way: walked from `to` to `from`, the line runs backwards and climb and
 * descent swap.
 */
export type WalkingLink = {
  readonly from: string;
  readonly to: string;
  /** Along the path, in metres. */
  readonly distanceM: number;
  /** Walking from `from` to `to`, in metres. */
  readonly climbM: number;
  readonly descentM: number;
  /** Share of the distance on waymarked hiking trails, 0 to 1. */
  readonly trailShare: number;
  /** Share of the distance on roads, 0 to 1; a trail along a road counts in both. */
  readonly roadShare: number;
  /** From `from` to `to`, simplified and rounded. */
  readonly line: readonly Position[];
};

export type RouteNetwork = {
  readonly format: typeof ROUTE_NETWORK_FORMAT;
  readonly version: typeof ROUTE_NETWORK_VERSION;
  readonly title: string;
  readonly attribution: string;
  readonly sources: readonly AccessSource[];
  /** When the network was prepared, YYYY-MM-DD. */
  readonly snapshot: CalendarDate;
  readonly nodes: readonly RouteNode[];
  readonly paddleLinks: readonly PaddleLink[];
  /** One per pair of nodes; none when the network was prepared without them. */
  readonly walkingLinks?: readonly WalkingLink[];
};
