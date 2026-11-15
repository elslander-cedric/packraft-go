// Suggested trips (ADR 0039, GLOSSARY "Suggested trip"): one-day trips proposed from your
// trip wishes, searched on the route network. Pure: the network, the rules and today's
// readings are passed in, and nothing is loaded or asked for here.
import { evaluateRecord, regionsAt, type AccessContext, type AccessRules } from "./access";
import type { Bounds, Position } from "./geo";
import type { PaddleLink, RouteNetwork, RouteNode, WalkingLink } from "./routeNetwork";
import type { Pace, TripWishes } from "./settings";
import { hikeTimeH, paddleTimeH } from "./summarise";

/** A paddle leg of a suggested trip: from one node to another, paddled through one or more links. */
export type SuggestedPaddleLeg = {
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

/** A hike leg of a suggested trip: one walking link, walked from `from` to `to`. */
export type SuggestedHikeLeg = {
  readonly mode: "hike";
  readonly from: string;
  readonly to: string;
  readonly distanceM: number;
  readonly climbM: number;
  readonly descentM: number;
  /** Shares of the distance on waymarked trails and on roads, 0 to 1. */
  readonly trailShare: number;
  readonly roadShare: number;
  /** From `from` to `to`. */
  readonly line: readonly Position[];
};

export type SuggestedLeg = SuggestedPaddleLeg | SuggestedHikeLeg;

export type SuggestedTrip = {
  readonly shape: "loop" | "one-way";
  /** Where the trip starts, then where each leg ends. */
  readonly nodes: readonly RouteNode[];
  /** Hike and paddle legs, taking turns. */
  readonly legs: readonly SuggestedLeg[];
  readonly hikeM: number;
  readonly paddleM: number;
  /** Climb and descent on its walks. */
  readonly climbM: number;
  readonly descentM: number;
  /** Shares of its walking on waymarked trails and on roads, 0 to 1; 0 when it doesn't walk. */
  readonly trailShare: number;
  readonly roadShare: number;
  /** Hiking and paddling time in hours, at the planner's pace. */
  readonly timeH: number;
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
 * - `hike-distance`: no trip here hikes about the wished distance.
 */
export type NoTripReason =
  | { readonly kind: "no-open-water" }
  | { readonly kind: "switches"; readonly maxSwitches: number }
  | { readonly kind: "shape"; readonly shape: SuggestedTrip["shape"] }
  | { readonly kind: "paddle-distance"; readonly paddleKm: number }
  | { readonly kind: "hike-distance"; readonly hikeKm: number };

export type SuggestedTrips =
  | { readonly status: "found"; readonly trips: readonly SuggestedTrip[] }
  | { readonly status: "none"; readonly reason: NoTripReason };

/** A suggestion's distances may land this far, as a share, either side of the wish (ADR 0039). */
const WISH_BAND = 0.2;
/** One day's hiking and paddling, in hours at the planner's pace: no suggestion is longer. */
const ONE_DAY_HOURS = 8;
/** Trips this close to the wishes, as a share, count as equally close, so trail and road share can rank them. */
const CLOSENESS_STEP = 0.05;
const MAX_TRIPS = 10;
/** At most this many suggestions per river stretch come before the others (ADR 0039). */
const PER_STRETCH = 2;

/** A link as it is paddled: its own way, or backwards on a canal or still water. */
type Step = { readonly to: string; readonly link: PaddleLink; readonly line: readonly Position[] };
/** Steps paddled in one go, and the nodes they pass after the first, ending with the last. */
type PaddleChain = { readonly steps: readonly Step[]; readonly passes: readonly string[]; readonly distanceM: number };
/** A walking link as it is walked: its own way, or backwards. */
type Walk = { readonly to: string; readonly link: WalkingLink; readonly backwards: boolean };
type Choice = { readonly mode: "paddle"; readonly chain: PaddleChain } | { readonly mode: "hike"; readonly walk: Walk };

/** A trip while it is searched: what it chose and its running totals; made a suggestion only if it ranks. */
type Candidate = {
  readonly start: RouteNode;
  readonly choices: readonly Choice[];
  /** Every node it passes, the start first. */
  readonly passed: readonly string[];
  readonly hikeM: number;
  readonly paddleM: number;
  /** Distances walked on trails and on roads. */
  readonly trailM: number;
  readonly roadM: number;
  readonly timeH: number;
  readonly paddleLegs: number;
};

const endOf = (trip: Candidate) => trip.passed[trip.passed.length - 1];
const shapeOf = (trip: Candidate): SuggestedTrip["shape"] =>
  trip.choices.length > 0 && endOf(trip) === trip.start.id ? "loop" : "one-way";
const switchesOf = (trip: Candidate) => 2 * trip.paddleLegs;

/** Up to 10 suggested trips for the wishes, best first, or why there are none. */
export function suggestTrips({ network: shipped, rules, when, area, wishes, pace }: SuggestedTripsSearch): SuggestedTrips {
  const network = withoutBankSpotsInWallonia(shipped, rules);
  const graph = searchGraph(network, openRecords(rules, when), pace);
  // Trips with one paddle leg are always searched, so "too many switches" can be told.
  const limits = { area, pace, maxPaddleLegs: Math.max(1, Math.floor(wishes.maxSwitches / 2)) };
  const candidates = network.nodes.filter((node) => inside(node, area)).flatMap((start) => tripsFrom(start, graph, limits));
  if (candidates.length === 0) return { status: "none", reason: { kind: "no-open-water" } };
  let trips = candidates;
  for (const [reason, keep] of wishFilters(wishes)) {
    trips = trips.filter(keep);
    if (trips.length === 0) return { status: "none", reason };
  }
  const best = varied(ranked(trips, wishes), graph.byId).slice(0, MAX_TRIPS);
  return { status: "found", trips: best.map((trip) => suggestion(trip, graph.byId)) };
}

/** The network without any bank spot in Wallonia and its links: there the AGW allows only aires (ADR 0039). */
function withoutBankSpotsInWallonia(network: RouteNetwork, rules: AccessRules): RouteNetwork {
  const inWallonia = ({ position: [lng, lat] }: RouteNode) => regionsAt({ lat, lng }, rules).includes("wallonia");
  const dropped = new Set(network.nodes.filter((node) => node.kind === "bank-spot" && inWallonia(node)).map((node) => node.id));
  if (dropped.size === 0) return network;
  const kept = (link: { from: string; to: string }) => !dropped.has(link.from) && !dropped.has(link.to);
  return {
    ...network,
    nodes: network.nodes.filter((node) => !dropped.has(node.id)),
    paddleLinks: network.paddleLinks.filter(kept),
    walkingLinks: (network.walkingLinks ?? []).filter(kept),
  };
}

type SearchGraph = {
  readonly byId: ReadonlyMap<string, RouteNode>;
  /** Every way of paddling in one go from a node within a day, ending where you may take out. */
  readonly chainsFrom: (id: string) => readonly PaddleChain[];
  readonly walksFrom: ReadonlyMap<string, readonly Walk[]>;
};

function searchGraph(network: RouteNetwork, open: (record: string) => boolean, pace: Pace): SearchGraph {
  const byId = new Map(network.nodes.map((node) => [node.id, node]));
  const steps = openSteps(network, open);
  const oneDayM = paddleKmInHours(ONE_DAY_HOURS, pace) * 1000;
  const chains = new Map<string, PaddleChain[]>();
  const chainsFrom = (id: string) => {
    let found = chains.get(id);
    if (!found) {
      found = paddleChains(id, steps, oneDayM).filter((chain) => byId.get(chain.passes[chain.passes.length - 1])?.use !== "put-in");
      chains.set(id, found);
    }
    return found;
  };
  return { byId, chainsFrom, walksFrom: walks(network) };
}

const paddleKmInHours = (hours: number, pace: Pace) => hours * pace.paddleSpeedKmh;

/** Every way each node can be walked from: each walking link either way. */
function walks(network: RouteNetwork): Map<string, Walk[]> {
  const from = new Map<string, Walk[]>();
  const add = (node: string, walk: Walk) => from.set(node, [...(from.get(node) ?? []), walk]);
  for (const link of network.walkingLinks ?? []) {
    add(link.from, { to: link.to, link, backwards: false });
    add(link.to, { to: link.from, link, backwards: true });
  }
  return from;
}

type Limits = { readonly area: Bounds; readonly pace: Pace; readonly maxPaddleLegs: number };

/**
 * Every trip from `start` within a day that paddles at least once and ends in the area: hike and
 * paddle legs taking turns, never passing a node twice, but maybe coming back round to `start`,
 * where it ends. It puts in only where it may and takes out only where it may.
 */
function tripsFrom(start: RouteNode, graph: SearchGraph, limits: Limits): Candidate[] {
  const found: Candidate[] = [];
  const extend = (trip: Candidate) => {
    const here = graph.byId.get(endOf(trip))!;
    if (trip.paddleLegs > 0 && inside(here, limits.area)) found.push(trip);
    if (shapeOf(trip) === "loop") return;
    for (const choice of nextChoices(trip, here, graph, limits)) {
      const next = withChoice(trip, choice, limits.pace);
      if (next.timeH <= ONE_DAY_HOURS) extend(next);
    }
  };
  extend({ start, choices: [], passed: [start.id], hikeM: 0, paddleM: 0, trailM: 0, roadM: 0, timeH: 0, paddleLegs: 0 });
  return found;
}

/** The legs a trip may take next from where it is: the other mode than its last leg, to nodes it hasn't passed. */
function nextChoices(trip: Candidate, here: RouteNode, graph: SearchGraph, limits: Limits): Choice[] {
  const last = trip.choices[trip.choices.length - 1]?.mode;
  const fresh = (id: string) => id === trip.start.id || !trip.passed.includes(id);
  const choices: Choice[] = [];
  if (last !== "paddle" && trip.paddleLegs < limits.maxPaddleLegs && here.use !== "take-out") {
    for (const chain of graph.chainsFrom(here.id)) {
      const through = chain.passes.slice(0, -1);
      if (fresh(chain.passes[chain.passes.length - 1]) && through.every((id) => !trip.passed.includes(id))) {
        choices.push({ mode: "paddle", chain });
      }
    }
  }
  if (last !== "hike") {
    for (const walk of graph.walksFrom.get(here.id) ?? []) {
      if (fresh(walk.to)) {
        choices.push({ mode: "hike", walk });
      }
    }
  }
  return choices;
}

function withChoice(trip: Candidate, choice: Choice, pace: Pace): Candidate {
  const choices = [...trip.choices, choice];
  if (choice.mode === "paddle") {
    const { distanceM, passes } = choice.chain;
    return {
      ...trip,
      choices,
      passed: [...trip.passed, ...passes],
      paddleM: trip.paddleM + distanceM,
      timeH: trip.timeH + paddleTimeH(distanceM / 1000, pace),
      paddleLegs: trip.paddleLegs + 1,
    };
  }
  const { link, backwards, to } = choice.walk;
  return {
    ...trip,
    choices,
    passed: [...trip.passed, to],
    hikeM: trip.hikeM + link.distanceM,
    trailM: trip.trailM + link.distanceM * link.trailShare,
    roadM: trip.roadM + link.distanceM * link.roadShare,
    timeH: trip.timeH + hikeTimeH(link.distanceM / 1000, backwards ? link.descentM : link.climbM, pace),
  };
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

/**
 * Every chain of steps from `start` up to `maxM` long that never passes a node twice, nor
 * paddles a link twice, but may come back round to `start`, where it ends.
 */
function paddleChains(start: string, steps: Map<string, Step[]>, maxM: number): PaddleChain[] {
  const chains: PaddleChain[] = [];
  const extend = (chain: PaddleChain) => {
    const here = chain.steps.length === 0 ? start : chain.passes[chain.passes.length - 1];
    for (const step of steps.get(here) ?? []) {
      const closes = step.to === start;
      const again = (chain.passes.includes(step.to) && !closes) || chain.steps.some((done) => done.link === step.link);
      const distanceM = chain.distanceM + step.link.distanceM;
      if (again || distanceM > maxM) continue;
      const next = { steps: [...chain.steps, step], passes: [...chain.passes, step.to], distanceM };
      chains.push(next);
      if (!closes) extend(next);
    }
  };
  extend({ steps: [], passes: [], distanceM: 0 });
  return chains;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function paddleLeg(from: string, { steps, passes, distanceM }: PaddleChain): SuggestedPaddleLeg {
  return {
    mode: "paddle",
    from,
    to: passes[passes.length - 1],
    distanceM,
    waters: unique(steps.flatMap((step) => step.link.waters)),
    records: unique(steps.flatMap((step) => step.link.records)),
    obstacles: steps.flatMap((step) => step.link.obstacles),
    // Each link's line starts where the one before ends.
    line: steps.flatMap((step, i) => (i === 0 ? step.line : step.line.slice(1))),
  };
}

function hikeLeg(from: string, { to, link, backwards }: Walk): SuggestedHikeLeg {
  return {
    mode: "hike",
    from,
    to,
    distanceM: link.distanceM,
    climbM: backwards ? link.descentM : link.climbM,
    descentM: backwards ? link.climbM : link.descentM,
    trailShare: link.trailShare,
    roadShare: link.roadShare,
    line: backwards ? [...link.line].reverse() : link.line,
  };
}

function suggestion(trip: Candidate, byId: ReadonlyMap<string, RouteNode>): SuggestedTrip {
  let from = trip.start.id;
  const legs = trip.choices.map((choice) => {
    const leg = choice.mode === "paddle" ? paddleLeg(from, choice.chain) : hikeLeg(from, choice.walk);
    from = leg.to;
    return leg;
  });
  const hikes = legs.filter((leg) => leg.mode === "hike");
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    shape: shapeOf(trip),
    nodes: [trip.start, ...legs.map((leg) => byId.get(leg.to)!)],
    legs,
    hikeM: trip.hikeM,
    paddleM: trip.paddleM,
    climbM: sum(hikes.map((leg) => leg.climbM)),
    descentM: sum(hikes.map((leg) => leg.descentM)),
    trailShare: trip.hikeM === 0 ? 0 : trip.trailM / trip.hikeM,
    roadShare: trip.hikeM === 0 ? 0 : trip.roadM / trip.hikeM,
    timeH: trip.timeH,
    switches: switchesOf(trip),
  };
}

type WishFilter = readonly [NoTripReason, (trip: Candidate) => boolean];

/** What each wish keeps, in the order they are applied, with the reason given when it keeps nothing. */
function wishFilters({ hikeKm, paddleKm, maxSwitches, shape }: TripWishes): WishFilter[] {
  const filters: WishFilter[] = [[{ kind: "switches", maxSwitches }, (trip) => switchesOf(trip) <= maxSwitches]];
  if (shape !== "either") filters.push([{ kind: "shape", shape }, (trip) => shapeOf(trip) === shape]);
  if (paddleKm !== undefined) filters.push([{ kind: "paddle-distance", paddleKm }, (trip) => nearWish(trip.paddleM, paddleKm)]);
  if (hikeKm !== undefined) filters.push([{ kind: "hike-distance", hikeKm }, (trip) => nearWish(trip.hikeM, hikeKm)]);
  return filters;
}

/** True when a distance is within the band around the wish. */
function nearWish(distanceM: number, wishKm: number): boolean {
  const wishM = wishKm * 1000;
  return distanceM >= wishM * (1 - WISH_BAND) && distanceM <= wishM * (1 + WISH_BAND);
}

/** How far a distance is from the wish, as a share of it; 0 with nothing wished. */
const offWish = (distanceM: number, wishKm: number | undefined) =>
  wishKm === undefined ? 0 : Math.abs(distanceM - wishKm * 1000) / (wishKm * 1000);

/**
 * The trips best first: closest to both wishes (in steps, so close fits count as equal), with no
 * paddle wish the longest paddle; then more of the walking on trails, then less on roads (a trip
 * that doesn't walk counts as all on trails and none on roads); with no hike wish the least
 * walking, as walking nobody wished for is no gain; then the closest, then the order found in.
 */
function ranked(trips: readonly Candidate[], { hikeKm, paddleKm }: TripWishes): Candidate[] {
  const keys = trips.map((trip, order) => {
    const off = offWish(trip.hikeM, hikeKm) + offWish(trip.paddleM, paddleKm);
    const walked = trip.hikeM > 0;
    return {
      trip,
      keys: [
        Math.round(off / CLOSENESS_STEP),
        paddleKm === undefined ? -trip.paddleM : 0,
        walked ? -trip.trailM / trip.hikeM : -1,
        walked ? trip.roadM / trip.hikeM : 0,
        hikeKm === undefined ? trip.hikeM : 0,
        off,
        order,
      ],
    };
  });
  const compare = (a: number[], b: number[]) => a.reduce((result, value, i) => result || value - b[i], 0);
  return keys.sort((a, b) => compare(a.keys, b.keys)).map(({ trip }) => trip);
}

/**
 * A trip's river stretches: the access records it paddles, as a Walloon record is one stretch.
 * A link from or to a bank spot counts by its waters instead: there one region record covers
 * every water (ADR 0039).
 */
function stretchesOf(trip: Candidate, byId: ReadonlyMap<string, RouteNode>): string[] {
  const atBankSpot = (id: string) => byId.get(id)?.kind === "bank-spot";
  const keys = (link: PaddleLink) =>
    atBankSpot(link.from) || atBankSpot(link.to) ? link.waters.map((water) => `water:${water}`) : link.records;
  return unique(trip.choices.flatMap((choice) => (choice.mode === "paddle" ? choice.chain.steps.flatMap((step) => keys(step.link)) : [])));
}

/**
 * The ranked trips, each trip that would be one too many on any of its stretches moved after
 * the others, in rank order, so the top ones aren't near-copies.
 */
function varied(ranked: readonly Candidate[], byId: ReadonlyMap<string, RouteNode>): Candidate[] {
  const perStretch = new Map<string, number>();
  const first: Candidate[] = [];
  const later: Candidate[] = [];
  for (const trip of ranked) {
    const stretches = stretchesOf(trip, byId);
    if (stretches.some((stretch) => (perStretch.get(stretch) ?? 0) >= PER_STRETCH)) {
      later.push(trip);
      continue;
    }
    for (const stretch of stretches) perStretch.set(stretch, (perStretch.get(stretch) ?? 0) + 1);
    first.push(trip);
    // Enough to show: the rest would only be cut.
    if (first.length === MAX_TRIPS) break;
  }
  return [...first, ...later];
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
