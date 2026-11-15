// Suggested trips (ADR 0039, GLOSSARY "Suggested trip"): one-day trips proposed from your
// trip wishes, searched on the route network. Pure: the network, the rules and today's
// readings are passed in, and nothing is loaded or asked for here.
import { evaluateRecord, type AccessContext, type AccessRules } from "./access";
import type { Bounds, Position } from "./geo";
import type { PaddleLink, RouteNetwork, RouteNode } from "./routeNetwork";
import type { Pace, TripWishes } from "./settings";

/** One leg of a suggested trip: from one node to another, paddled through one or more links. */
export type SuggestedLeg = {
  readonly mode: "paddle";
  readonly from: string;
  readonly to: string;
  readonly distanceM: number;
  /** The rivers it paddles, in order, each once. */
  readonly waters: readonly string[];
  /** The access records it paddles, in order, each once. */
  readonly records: readonly string[];
  /** The obstacles it passes (warnings only), in order, by id. */
  readonly obstacles: readonly string[];
  /** From `from` to `to`. */
  readonly line: readonly Position[];
};

export type SuggestedTrip = {
  readonly shape: "loop" | "one-way";
  /** Where the trip starts, then where each leg ends. */
  readonly nodes: readonly RouteNode[];
  readonly legs: readonly SuggestedLeg[];
  readonly paddleM: number;
  /** Every put-in and every take-out counts one. */
  readonly switches: number;
};

/** The date the search is for, and today's live readings when that date is today. */
export type SearchDate = AccessContext & { readonly date: string; readonly today: string };

export type SuggestedTripsSearch = {
  readonly network: RouteNetwork;
  readonly rules: AccessRules;
  readonly when: SearchDate;
  /** The visible map area: every suggestion starts and ends inside it. */
  readonly area: Bounds;
  readonly wishes: TripWishes;
  readonly pace: Pace;
};

/**
 * Why the search found nothing, the first of these that rules every trip out:
 * - `no-open-water`: no open water to paddle in a day starts and ends in the area on the date.
 * - `switches`: every trip here needs more switches than wished.
 * - `shape`: no trip here is a loop (or one-way) as wished.
 * - `paddle-distance`: no trip here paddles about the wished distance.
 */
export type NoTripReason =
  | { readonly kind: "no-open-water" }
  | { readonly kind: "switches"; readonly maxSwitches: number }
  | { readonly kind: "shape"; readonly shape: SuggestedTrip["shape"] }
  | { readonly kind: "paddle-distance"; readonly paddleKm: number };

export type SuggestedTrips =
  | { readonly status: "found"; readonly trips: readonly SuggestedTrip[] }
  | { readonly status: "none"; readonly reason: NoTripReason };

/** A suggestion's distances may land this far, as a share, either side of the wish (ADR 0039). */
const WISH_BAND = 0.2;
/** One day's paddling, in hours at the planner's paddling speed: no suggestion is longer. */
const ONE_DAY_PADDLING_HOURS = 8;

/** A link as it is paddled: its own way, or backwards on a canal or still water. */
type Step = { readonly to: string; readonly link: PaddleLink; readonly line: readonly Position[] };

/** Up to 10 suggested trips for the wishes, best first, or why there are none. */
export function suggestTrips({ network, rules, when, area, wishes, pace }: SuggestedTripsSearch): SuggestedTrips {
  const steps = openSteps(network, openRecords(rules, when));
  const byId = new Map(network.nodes.map((node) => [node.id, node]));
  const oneDayM = pace.paddleSpeedKmh * ONE_DAY_PADDLING_HOURS * 1000;
  const starts = network.nodes.filter((node) => node.use !== "take-out" && inside(node, area));
  const candidates = starts.flatMap((start) =>
    paddleChains(start.id, steps, oneDayM)
      .map((chain) => paddleTrip(start, chain, byId))
      .filter(({ nodes }) => canEnd(nodes[nodes.length - 1], area)),
  );
  if (candidates.length === 0) return { status: "none", reason: { kind: "no-open-water" } };
  let trips = candidates;
  for (const [reason, keep] of wishFilters(wishes)) {
    trips = trips.filter(keep);
    if (trips.length === 0) return { status: "none", reason };
  }
  const ranked = trips
    .map((trip, order) => ({ trip, order, off: offWish(trip.paddleM, wishes.paddleKm) }))
    .sort((a, b) => a.off - b.off || a.order - b.order)
    .map(({ trip }) => trip);
  return { status: "found", trips: varied(ranked).slice(0, MAX_TRIPS) };
}

const MAX_TRIPS = 10;
/** At most this many suggestions per river stretch come before the others (ADR 0039). */
const PER_STRETCH = 2;

/**
 * The ranked trips, each trip that would be one too many on any of its stretches (access
 * records) moved after the others, in rank order, so the top ones aren't near-copies.
 */
function varied(ranked: readonly SuggestedTrip[]): SuggestedTrip[] {
  const perStretch = new Map<string, number>();
  const first: SuggestedTrip[] = [];
  const later: SuggestedTrip[] = [];
  for (const trip of ranked) {
    const stretches = unique(trip.legs.flatMap((leg) => leg.records));
    if (stretches.some((stretch) => (perStretch.get(stretch) ?? 0) >= PER_STRETCH)) {
      later.push(trip);
      continue;
    }
    for (const stretch of stretches) perStretch.set(stretch, (perStretch.get(stretch) ?? 0) + 1);
    first.push(trip);
  }
  return [...first, ...later];
}

/** Every way each node can be paddled from, on links open on the date. */
function openSteps(network: RouteNetwork, open: (record: string) => boolean): Map<string, Step[]> {
  const steps = new Map<string, Step[]>();
  const add = (from: string, step: Step) => steps.set(from, [...(steps.get(from) ?? []), step]);
  for (const link of network.paddleLinks) {
    if (link.records.length === 0 || !link.records.every(open)) continue;
    add(link.from, { to: link.to, link, line: link.line });
    if (link.direction === "both") add(link.to, { to: link.from, link, line: [...link.line].reverse() });
  }
  return steps;
}

function inside({ position: [lng, lat] }: RouteNode, [west, south, east, north]: Bounds): boolean {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

const canEnd = (node: RouteNode, area: Bounds) => node.use !== "put-in" && inside(node, area);

/**
 * Every chain of steps from `start` up to `maxM` long that never passes a node twice, nor
 * paddles a link twice, but may come back round to `start`, where it ends.
 */
function paddleChains(start: string, steps: Map<string, Step[]>, maxM: number): Step[][] {
  const chains: Step[][] = [];
  const extend = (chain: readonly Step[], visited: ReadonlySet<string>, distanceM: number) => {
    const here = chain.length === 0 ? start : chain[chain.length - 1].to;
    for (const step of steps.get(here) ?? []) {
      const closes = step.to === start;
      const again = (visited.has(step.to) && !closes) || chain.some((done) => done.link === step.link);
      const total = distanceM + step.link.distanceM;
      if (again || total > maxM) continue;
      const next = [...chain, step];
      chains.push(next);
      if (!closes) extend(next, new Set([...visited, step.to]), total);
    }
  };
  extend([], new Set([start]), 0);
  return chains;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function paddleTrip(start: RouteNode, chain: readonly Step[], byId: Map<string, RouteNode>): SuggestedTrip {
  const from = start.id;
  const to = chain[chain.length - 1].to;
  const distanceM = chain.reduce((sum, step) => sum + step.link.distanceM, 0);
  const leg: SuggestedLeg = {
    mode: "paddle",
    from,
    to,
    distanceM,
    waters: unique(chain.flatMap((step) => step.link.waters)),
    records: unique(chain.flatMap((step) => step.link.records)),
    obstacles: chain.flatMap((step) => step.link.obstacles),
    // Each link's line starts where the one before ends.
    line: chain.flatMap((step, i) => (i === 0 ? step.line : step.line.slice(1))),
  };
  const shape = to === from ? "loop" : "one-way";
  return { shape, nodes: [start, byId.get(to)!], legs: [leg], paddleM: distanceM, switches: 2 };
}

type WishFilter = readonly [NoTripReason, (trip: SuggestedTrip) => boolean];

/** What each wish keeps, in the order they are applied, with the reason given when it keeps nothing. */
function wishFilters({ paddleKm, maxSwitches, shape }: TripWishes): WishFilter[] {
  return [
    [{ kind: "switches", maxSwitches }, (trip) => trip.switches <= maxSwitches],
    ...(shape === "either" ? [] : [[{ kind: "shape", shape }, (trip) => trip.shape === shape] as WishFilter]),
    ...(paddleKm === undefined
      ? []
      : [[{ kind: "paddle-distance", paddleKm }, (trip) => nearWish(trip.paddleM, paddleKm)] as WishFilter]),
  ];
}

/** True when a distance is within the band around the wish. */
function nearWish(distanceM: number, wishKm: number): boolean {
  const wishM = wishKm * 1000;
  return distanceM >= wishM * (1 - WISH_BAND) && distanceM <= wishM * (1 + WISH_BAND);
}

/** How far a distance is from the wish, as a share of it; 0 when nothing was wished. */
function offWish(distanceM: number, wishKm: number | undefined): number {
  return wishKm === undefined ? 0 : Math.abs(distanceM - wishKm * 1000) / (wishKm * 1000);
}

/** Whether an access record's water is open on the date; each record is evaluated once. */
function openRecords(rules: AccessRules, when: SearchDate): (id: string) => boolean {
  const records = new Map(rules.records.map((record) => [record.id, record]));
  const known = new Map<string, boolean>();
  return (id) => {
    let open = known.get(id);
    if (open === undefined) {
      const record = records.get(id);
      open = record !== undefined && evaluateRecord(record, when).state === "open";
      known.set(id, open);
    }
    return open;
  };
}
