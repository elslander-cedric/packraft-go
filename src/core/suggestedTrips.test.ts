import { describe, expect, it } from "vitest";
import type { AccessRecord, AccessRules, AgwRule } from "./access";
import type { AccessPointUse } from "./accessPoints";
import type { FlowReadings } from "./flow";
import type { OfficialReadings } from "./officialStatus";
import type { Bounds, Position } from "./geo";
import {
  ROUTE_NETWORK_FORMAT,
  ROUTE_NETWORK_VERSION,
  type PaddleDirection,
  type PaddleLink,
  type RouteNetwork,
  type RouteNode,
} from "./routeNetwork";
import { defaultSettings, type TripWishes } from "./settings";
import { suggestTrips, type SearchDate, type SuggestedTripsSearch } from "./suggestedTrips";

// A small hand-made network. Nodes sit 0.01° of longitude apart along 50.5 N; link
// distances are given in km and don't follow from the positions.
const source = { title: "Test source", url: "https://example.org/rules" };
const researched = "2026-10-01";
const anywhere = { type: "LineString", coordinates: [[5, 50], [5.1, 50]] } as const;

function fixedRecord(id: string, state: "open" | "forbidden" | "unknown"): AccessRecord {
  return { id, name: id, scope: "water", region: "test", rule: { type: "fixed", state, text: state }, geometry: anywhere, source, researched };
}

const rules: AccessRules = {
  records: [fixedRecord("open-1", "open"), fixedRecord("open-2", "open"), fixedRecord("forbidden", "forbidden"), fixedRecord("unknown", "unknown")],
};

function node(id: string, x: number, use: AccessPointUse = "both"): RouteNode {
  return { id, kind: "official-aire", use, position: [5 + x * 0.01, 50.5] };
}

function link(from: string, to: string, km: number, options: { records?: string[]; direction?: PaddleDirection; waters?: string[]; obstacles?: string[] } = {}): PaddleLink {
  return {
    from,
    to,
    direction: options.direction ?? "downstream",
    distanceM: km * 1000,
    waters: options.waters ?? ["River"],
    records: options.records ?? ["open-1"],
    obstacles: options.obstacles ?? [],
    line: [[0, 0], [1, 1]] as Position[],
  };
}

function network(nodes: RouteNode[], paddleLinks: PaddleLink[]): RouteNetwork {
  return {
    format: ROUTE_NETWORK_FORMAT,
    version: ROUTE_NETWORK_VERSION,
    title: "Test network",
    attribution: "Test",
    sources: [source],
    snapshot: "2026-11-01",
    nodes,
    paddleLinks,
  };
}

const everywhere: Bounds = [4, 49, 6, 51];
const today = "2026-11-15";
const wishes = (changes: Partial<TripWishes> = {}): TripWishes => ({ paddleKm: 10, maxSwitches: 2, shape: "either", ...changes });

function search(changes: Partial<SuggestedTripsSearch> & Pick<SuggestedTripsSearch, "network">): ReturnType<typeof suggestTrips> {
  return suggestTrips({ rules, when: { date: today, today }, area: everywhere, wishes: wishes(), pace: defaultSettings, ...changes });
}

/** The suggested trips as "A>B>C" stop ids, in their order. */
function stops(result: ReturnType<typeof suggestTrips>): string[] {
  if (result.status !== "found") return [];
  return result.trips.map((trip) => trip.nodes.map((stop) => stop.id).join(">"));
}

describe("suggested trips: paddle only", () => {
  it("suggest a put-in at one aire, the paddle down the river and a take-out at the next", () => {
    const result = search({ network: network([node("A", 0), node("B", 1)], [link("A", "B", 10, { obstacles: ["rocks-1"] })]) });
    expect(result).toEqual({
      status: "found",
      trips: [
        {
          shape: "one-way",
          nodes: [node("A", 0), node("B", 1)],
          legs: [
            {
              mode: "paddle",
              from: "A",
              to: "B",
              distanceM: 10000,
              waters: ["River"],
              records: ["open-1"],
              obstacles: ["rocks-1"],
              line: [[0, 0], [1, 1]],
            },
          ],
          paddleM: 10000,
          switches: 2,
        },
      ],
    });
  });

  // A river paddled downstream from A to E, 4 km between aires.
  const river = network(
    [node("A", 0), node("B", 1), node("C", 2), node("D", 3), node("E", 4)],
    [link("A", "B", 4), link("B", "C", 4), link("C", "D", 4), link("D", "E", 4)],
  );

  it("paddle past aires through several links in one leg, without getting out", () => {
    const result = search({ network: river, wishes: wishes({ paddleKm: 12 }) });
    expect(stops(result)).toEqual(["A>D", "B>E"]);
    if (result.status !== "found") throw new Error("no trips");
    expect(result.trips[0].legs).toHaveLength(1);
    expect(result.trips[0].legs[0]).toMatchObject({ from: "A", to: "D", distanceM: 12000 });
    expect(result.trips[0].switches).toBe(2);
  });

  it("join the links' lines, waters, records and obstacles in paddling order", () => {
    const joined = network(
      [node("A", 0), node("B", 1), node("C", 2)],
      [
        { ...link("A", "B", 5, { waters: ["Warche", "Amblève"], records: ["open-1"], obstacles: ["rocks-1"] }), line: [[1, 1], [2, 2]] },
        { ...link("B", "C", 5, { waters: ["Amblève"], records: ["open-1", "open-2"], obstacles: ["rocks-2"] }), line: [[2, 2], [3, 3]] },
      ],
    );
    const result = search({ network: joined });
    if (result.status !== "found") throw new Error("no trips");
    expect(result.trips[0].legs[0]).toEqual({
      mode: "paddle",
      from: "A",
      to: "C",
      distanceM: 10000,
      waters: ["Warche", "Amblève"],
      records: ["open-1", "open-2"],
      obstacles: ["rocks-1", "rocks-2"],
      line: [[1, 1], [2, 2], [3, 3]],
    });
  });

  it.each([
    [7, ["A>C", "B>D", "C>E"]],
    [6.7, ["A>C", "B>D", "C>E"]], // 8 km is just within 20% more
    [6.6, []], // 4 km and 8 km are both more than 20% off
    [13.3, ["A>D", "B>E"]], // 16 km is more than 20% more
    [15, ["A>E", "A>D", "B>E"]], // 12 km is 20% less: in, but further off than 16 km
  ])("keep trips within 20%% of a wished %s km of paddling", (paddleKm, expected) => {
    expect(stops(search({ network: river, wishes: wishes({ paddleKm }) }))).toEqual(expected);
  });

  it("paddle rivers downstream only", () => {
    expect(stops(search({ network: network([node("A", 0), node("B", 1)], [link("B", "A", 10)]) }))).toEqual(["B>A"]);
  });

  it("paddle a canal either way, its line turned round when paddled backwards", () => {
    const canal = network([node("A", 0), node("B", 1)], [{ ...link("A", "B", 10, { direction: "both" }), line: [[1, 1], [2, 2], [3, 3]] }]);
    const result = search({ network: canal });
    expect(stops(result)).toEqual(["A>B", "B>A"]);
    if (result.status !== "found") throw new Error("no trips");
    expect(result.trips[1].legs[0]).toMatchObject({ from: "B", to: "A", line: [[3, 3], [2, 2], [1, 1]] });
  });

  it("start and end inside the visible area, wherever they paddle in between", () => {
    // Only B, C and D are inside: 0.005° either side of x = 1 and x = 3.
    const area: Bounds = [5.005, 50.4, 5.035, 50.6];
    expect(stops(search({ network: river, area, wishes: wishes({ paddleKm: 8 }) }))).toEqual(["B>D"]);
    expect(stops(search({ network: river, area, wishes: wishes({ paddleKm: 4 }) }))).toEqual(["B>C", "C>D"]);
  });

  it("put in only where an aire allows it, and take out only where one allows it", () => {
    const aires = network(
      [node("A", 0, "take-out"), node("B", 1, "put-in"), node("C", 2, "both"), node("D", 3, "put-in"), node("E", 4, "take-out")],
      [link("A", "B", 4), link("B", "C", 4), link("C", "D", 4), link("D", "E", 4)],
    );
    expect(stops(search({ network: aires, wishes: wishes({ paddleKm: 8 }) }))).toEqual(["C>E"]);
    expect(stops(search({ network: aires, wishes: wishes({ paddleKm: 4 }) }))).toEqual(["B>C", "D>E"]);
  });
});

describe("suggested trips: switches, loops and one day", () => {
  const river = network([node("A", 0), node("B", 1), node("C", 2)], [link("A", "B", 5), link("B", "C", 5)]);
  // A ring of water, A to B to C and back to A, 4 km a side.
  const ring = network([node("A", 0), node("B", 1), node("C", 2)], [link("A", "B", 4), link("B", "C", 4), link("C", "A", 4)]);

  it("count the put-in and the take-out as a switch each, and keep them within the most wished", () => {
    expect(stops(search({ network: river, wishes: wishes({ maxSwitches: 2 }) }))).toEqual(["A>C"]);
    expect(stops(search({ network: river, wishes: wishes({ maxSwitches: 5 }) }))).toEqual(["A>C"]);
    expect(stops(search({ network: river, wishes: wishes({ maxSwitches: 1 }) }))).toEqual([]);
  });

  it("go round a ring of water back to the put-in as a loop", () => {
    const result = search({ network: ring, wishes: wishes({ paddleKm: 12, shape: "loop" }) });
    expect(stops(result)).toEqual(["A>A", "B>B", "C>C"]);
    if (result.status !== "found") throw new Error("no trips");
    expect(result.trips[0]).toMatchObject({ shape: "loop", paddleM: 12000, switches: 2 });
  });

  it.each([
    ["loop", ["A>A", "B>B", "C>C"]],
    ["one-way", ["A>C", "B>A", "C>B"]],
    ["either", ["A>A", "A>C", "B>A", "B>B", "C>B", "C>C"]],
  ] as const)("suggest %s trips when that is wished", (shape, expected) => {
    // 8 km one-way and 12 km round: both within 20% of 10 km, equally close.
    expect(stops(search({ network: ring, wishes: wishes({ paddleKm: 10, shape }) })).sort()).toEqual(expected);
  });

  it("never paddle the same link twice, so a canal out and back is not a loop", () => {
    const canal = network([node("A", 0), node("B", 1)], [link("A", "B", 5, { direction: "both" })]);
    expect(stops(search({ network: canal, wishes: wishes({ shape: "loop" }) }))).toEqual([]);
  });

  it("keep within one day of paddling at the planner's paddling speed when no distance is wished", () => {
    const long = network(
      [node("A", 0), node("B", 1), node("C", 2), node("D", 3)],
      [link("A", "B", 15), link("B", "C", 15), link("C", "D", 15)],
    );
    const noDistance = wishes({ paddleKm: undefined });
    // 8 hours at 5 km/h is 40 km: 45 km is too long.
    expect(stops(search({ network: long, wishes: noDistance })).sort()).toEqual(["A>B", "A>C", "B>C", "B>D", "C>D"]);
    expect(stops(search({ network: long, wishes: noDistance, pace: { ...defaultSettings, paddleSpeedKmh: 6 } })).sort()).toEqual([
      "A>B",
      "A>C",
      "A>D",
      "B>C",
      "B>D",
      "C>D",
    ]);
  });

  it("keep within one day also when a longer paddle is wished", () => {
    const long = network([node("A", 0), node("B", 1)], [link("A", "B", 45)]);
    expect(stops(search({ network: long, wishes: wishes({ paddleKm: 45 }) }))).toEqual([]);
  });
});

describe("suggested trips: why there are none", () => {
  const river = network([node("A", 0), node("B", 1), node("C", 2)], [link("A", "B", 5), link("B", "C", 5)]);
  const closed = network([node("A", 0), node("B", 1)], [link("A", "B", 10, { records: ["forbidden"] })]);

  it("no open water in this area on this date", () => {
    const none = { status: "none", reason: { kind: "no-open-water" } };
    expect(search({ network: closed })).toEqual(none);
    expect(search({ network: river, area: [6, 49, 6.1, 49.1] })).toEqual(none);
    expect(search({ network: network([], []) })).toEqual(none);
  });

  it("every trip here needs more switches than allowed", () => {
    expect(search({ network: river, wishes: wishes({ maxSwitches: 1 }) })).toEqual({
      status: "none",
      reason: { kind: "switches", maxSwitches: 1 },
    });
  });

  it("no trip here is a loop", () => {
    expect(search({ network: river, wishes: wishes({ shape: "loop" }) })).toEqual({
      status: "none",
      reason: { kind: "shape", shape: "loop" },
    });
  });

  it("no trip of about the wished distance fits here", () => {
    expect(search({ network: river, wishes: wishes({ paddleKm: 30 }) })).toEqual({
      status: "none",
      reason: { kind: "paddle-distance", paddleKm: 30 },
    });
  });

  it("give the first reason that rules every trip out: open water, then switches, then loop or one-way, then distance", () => {
    const everything = wishes({ paddleKm: 30, maxSwitches: 1, shape: "loop" });
    expect(search({ network: closed, wishes: everything })).toMatchObject({ reason: { kind: "no-open-water" } });
    expect(search({ network: river, wishes: everything })).toMatchObject({ reason: { kind: "switches" } });
    expect(search({ network: river, wishes: { ...everything, maxSwitches: 2 } })).toMatchObject({ reason: { kind: "shape" } });
  });
});

describe("suggested trips: ranking and variety", () => {
  /** A river of `count` 10 km links from node 0 down, on one stretch (access record). */
  function riverOf(count: number, prefix: string, record: string): { nodes: RouteNode[]; links: PaddleLink[] } {
    const nodes = Array.from({ length: count + 1 }, (_, i) => node(`${prefix}${i}`, i));
    const links = nodes.slice(1).map((to, i) => link(nodes[i].id, to.id, 10, { records: [record] }));
    return { nodes, links };
  }

  it("put the trips closest to the wished distance first", () => {
    const nearer = network(
      [node("A", 0), node("B", 1), node("C", 2), node("D", 3)],
      [link("A", "B", 11, { records: ["open-1"] }), { ...link("C", "D", 9.5, { records: ["open-2"] }) }],
    );
    expect(stops(search({ network: nearer }))).toEqual(["C>D", "A>B"]);
  });

  it("put the longest paddles first when no paddle distance is wished", () => {
    const lengths = network(
      [node("A", 0), node("B", 1), node("C", 2), node("D", 3)],
      [link("A", "B", 0.4, { records: ["open-1"] }), link("C", "D", 12, { records: ["open-2"] })],
    );
    expect(stops(search({ network: lengths, wishes: wishes({ paddleKm: undefined }) }))).toEqual(["C>D", "A>B"]);
  });

  it("show at most 10", () => {
    const { nodes, links } = riverOf(12, "R", "open-1");
    const result = search({ network: network(nodes, links) });
    expect(stops(result)).toEqual(["R0>R1", "R1>R2", "R2>R3", "R3>R4", "R4>R5", "R5>R6", "R6>R7", "R7>R8", "R8>R9", "R9>R10"]);
  });

  it("show at most two from one river stretch before others, however close, then the rest", () => {
    const one = riverOf(5, "R", "open-1");
    const other = { ...link("S0", "S1", 11, { records: ["open-2"] }) };
    const varied = network([...one.nodes, node("S0", 10), node("S1", 11)], [...one.links, other]);
    expect(stops(search({ network: varied }))).toEqual(["R0>R1", "R1>R2", "S0>S1", "R2>R3", "R3>R4", "R4>R5"]);
  });
});

describe("suggested trips: only water open on the date", () => {
  // A 10 km stretch from A to C, paddled through B; the second link's water varies.
  const through = (record: string) =>
    network([node("A", 0), node("B", 1), node("C", 2)], [link("A", "B", 5), link("B", "C", 5, { records: ["open-1", record] })]);
  const future = "2027-05-01";

  function agwRecord(id: string, rule: Partial<AgwRule>): AccessRecord {
    const agw: AgwRule = { type: "agw", category: "1.A", minM3s: null, maxM3s: 100, gauge: null, ...rule };
    return { id, name: id, scope: "water", region: "wallonia", rule: agw, geometry: anywhere, source, researched };
  }
  const walloon: AccessRules = {
    records: [
      ...rules.records,
      agwRecord("official", { officialStretch: "S1" }),
      agwRecord("winter-only", { category: "1.C", officialStretch: "S2" }),
      agwRecord("gauged", { minM3s: 2, gauge: { name: "Gauge", stationNo: "G1", assumed: false } }),
    ],
  };
  const officialReadings = (code: string): OfficialReadings => ({ status: "ok", stretches: { S1: { code }, S2: { code: "1" } } });
  const flows = (m3s: number): FlowReadings => ({
    status: "ok",
    gauges: { G1: { mean72h: [{ at: `${today}T00:00:00.000+01:00`, m3s }], hourly: [{ at: `${today}T08:00:00.000+01:00`, m3s }] } },
  });
  const found = (network: RouteNetwork, when: SearchDate) => stops(search({ network, rules: walloon, when }));

  it.each(["forbidden", "unknown", "not-in-the-rules"])("leave out %s water, and never paddle through it", (record) => {
    expect(found(through(record), { date: today, today })).toEqual([]);
  });

  it("leave out a link with no access record", () => {
    expect(found(network([node("A", 0), node("B", 1)], [link("A", "B", 10, { records: [] })]), { date: today, today })).toEqual([]);
  });

  it("today, follow the live official status", () => {
    expect(found(through("official"), { date: today, today, official: officialReadings("1") })).toEqual(["A>C"]);
    expect(found(through("official"), { date: today, today, official: officialReadings("0") })).toEqual([]);
  });

  it("today, follow the live flow where there is no official status", () => {
    expect(found(through("gauged"), { date: today, today, flows: flows(5) })).toEqual(["A>C"]);
    expect(found(through("gauged"), { date: today, today, flows: flows(1) })).toEqual([]);
  });

  it("on a future date, follow season and hours only, not today's status or flow", () => {
    const when = { date: future, today, official: officialReadings("0"), flows: flows(1) };
    expect(found(through("official"), when)).toEqual(["A>C"]);
    expect(found(through("gauged"), when)).toEqual(["A>C"]);
  });

  it("leave out water closed for the season on the date", () => {
    expect(found(through("winter-only"), { date: today, today, official: officialReadings("1") })).toEqual(["A>C"]);
    expect(found(through("winter-only"), { date: future, today })).toEqual([]);
  });

  it("leave out water whose status today is still loading", () => {
    expect(found(through("official"), { date: today, today, officialPending: true })).toEqual([]);
  });
});
