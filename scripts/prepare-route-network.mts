// Prepares the built-in route network for suggested trips (ADR 0039): the official aires as
// nodes, the paddle links between them, from the Walloon stretch records, their OSM ways,
// the obstacles and the locks, and the walking links between nodes close enough to walk,
// routed by the public BRouter server preferring waymarked trails. Manual only: never run by `npm test`, `npm run e2e` or CI.
// Review the diff of src/access/data/route-network.json and the report before committing.
//
//   npm run prepare:route-network              # reuses cached Overpass and BRouter answers
//   npm run prepare:route-network -- --offline # refuses to ask Overpass or BRouter
//
// Politeness: one request at a time with a pause between them, identified by the project URL
// only, every answer cached in .cache/route-network-osm/ and .cache/route-network-brouter/
// (git-ignored).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { LockDataset, ObstacleDataset, OfficialAireDataset } from "../src/access/dataset";
import { dateInBrussels } from "../src/core/calendarDate";
import type { WalkingLink } from "../src/core/routeNetwork";
import { createBRouterClient } from "../src/dataprep/routeNetwork/brouterClient";
import { buildRouteNetwork, type NetworkInputs } from "../src/dataprep/routeNetwork/build";
import { recordQuery } from "../src/dataprep/routeNetwork/overpass";
import { serialiseRouteNetwork } from "../src/dataprep/routeNetwork/serialise";
import { WALKING_CEILING_M, walkingLink, walkingPairs, walkingUrl } from "../src/dataprep/routeNetwork/walking";
import { createOverpassClient, type OverpassResult } from "../src/dataprep/walloonStretches/overpass";

const ROOT = path.join(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache", "route-network-osm");
const BROUTER_CACHE_DIR = path.join(ROOT, ".cache", "route-network-brouter");
const OUT = path.join(ROOT, "src", "access", "data", "route-network.json");
const ENDPOINT = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const offline = process.argv.includes("--offline");

type StretchFile = {
  sources: { annex1: string };
  researchDate: string;
  stretches: { id: string; river: string; line: [number, number][] }[];
};

const json = async <T,>(...parts: string[]): Promise<T> => JSON.parse(await readFile(path.join(ROOT, ...parts), "utf8"));
const stretches = await json<StretchFile>("src", "data", "walloon-stretches.json");
const aires = await json<OfficialAireDataset>("src", "access", "data", "official-aires.json");
const obstacles = await json<ObstacleDataset>("src", "access", "data", "obstacles.json");
const locks = await json<LockDataset>("src", "access", "data", "locks.json");

const keyFile = (query: string, directory = CACHE_DIR) =>
  path.join(directory, `${createHash("sha256").update(query).digest("hex").slice(0, 16)}.json`);
await mkdir(CACHE_DIR, { recursive: true });
await mkdir(BROUTER_CACHE_DIR, { recursive: true });
const overpass = createOverpassClient({
  endpoint: ENDPOINT,
  fetch: async (url, init) => {
    if (offline) {
      throw new Error("an Overpass answer is not cached and --offline was given");
    }
    console.log(`  fetching from ${new URL(url).host} ...`);
    return fetch(url, { ...init, signal: AbortSignal.timeout(240_000) });
  },
  wait: async (ms) => {
    await sleep(ms);
  },
  now: () => Date.now(),
  cache: {
    read: async (query) => readFile(keyFile(query), "utf8").catch(() => undefined),
    write: async (query, body) => writeFile(keyFile(query), body),
  },
  log: (message) => console.log(`  ${message}`),
});

const records = stretches.stretches.map((stretch) => ({
  id: `walloon-${stretch.id}`,
  river: stretch.river,
  line: stretch.line,
}));
const osm: Record<string, OverpassResult> = {};
for (const record of records) {
  console.log(`OSM: ${record.id} (${record.river})`);
  osm[record.id] = await overpass.query(recordQuery(record.line));
}

const today = dateInBrussels(Date.now());
const inputs: NetworkInputs = {
  records,
  osm,
  aires: aires.aires.map((aire) => ({ id: `official-aire-${aire.number}`, use: aire.use, position: aire.position })),
  obstacles: obstacles.obstacles.map((obstacle) => ({
    id: `obstacle-${obstacle.spwId}`,
    kind: obstacle.kind,
    position: obstacle.position,
  })),
  locks: locks.locks,
  sources: [
    { title: `Walloon stretches, AGW 19 March 2009 Annex 1 (researched ${stretches.researchDate})`, url: stretches.sources.annex1 },
    { title: `${aires.source.title} (snapshot ${aires.snapshot})`, url: aires.source.url },
    { title: `${obstacles.source.title} (snapshot ${obstacles.snapshot})`, url: obstacles.source.url },
    { title: `Locks in Flanders and Brussels, OpenStreetMap (extracted ${locks.extracted})`, url: "https://www.openstreetmap.org/copyright" },
    { title: `OpenStreetMap waterways, dams and lock gates via Overpass (${today})`, url: "https://www.openstreetmap.org/copyright" },
    { title: `Walking links routed by BRouter on OpenStreetMap (${today})`, url: "https://brouter.de/" },
  ],
  snapshot: today,
};

const built = buildRouteNetwork(inputs);
const report = built.report;

let brouterRequests = 0;
const brouter = createBRouterClient({
  fetch: async (url, init) => {
    if (offline) {
      throw new Error("a BRouter answer is not cached and --offline was given");
    }
    brouterRequests += 1;
    return fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  },
  wait: async (ms) => {
    await sleep(ms);
  },
  now: () => Date.now(),
  cache: {
    read: async (url) => readFile(keyFile(url, BROUTER_CACHE_DIR), "utf8").catch(() => undefined),
    write: async (url, answer) => writeFile(keyFile(url, BROUTER_CACHE_DIR), answer),
  },
  log: (message) => console.log(`  ${message}`),
});
const pairs = walkingPairs(built.network.nodes);
const walkingLinks: WalkingLink[] = [];
const unwalked: string[] = [];
for (const [i, pair] of pairs.entries()) {
  const answer = await brouter.answer(walkingUrl(pair));
  const made = walkingLink(pair, answer);
  if (made) {
    walkingLinks.push(made);
  } else {
    unwalked.push(`${pair.from.id} - ${pair.to.id}`);
  }
  if ((i + 1) % 50 === 0) {
    console.log(`BRouter: ${i + 1} of ${pairs.length} pairs`);
  }
}

const network = { ...built.network, walkingLinks };
await writeFile(OUT, serialiseRouteNetwork(network));
console.log(
  `\nWrote src/access/data/route-network.json: ${network.nodes.length} nodes, ${network.paddleLinks.length} paddle links, ` +
    `${walkingLinks.length} walking links (of ${pairs.length} pairs within ${WALKING_CEILING_M / 1000} km as the crow flies)`,
);
console.log(`${brouterRequests} requests to BRouter, the rest from its cache`);
console.log(`${unwalked.length} pairs have no walking link (no route, or over ${WALKING_CEILING_M / 1000} km along paths)`);

for (const { record, river, withM, againstM } of report.disagreeing) {
  console.log(`REVIEW ${record} (${river}): OSM ways disagree on direction: ${withM} m with the line, ${againstM} m against`);
}
for (const record of report.withoutOsm) {
  console.log(`REVIEW ${record}: no OSM waterway along it, so no links`);
}
for (const aire of report.airesOffWater) {
  console.log(`REVIEW ${aire}: on no stretch's water, so no links`);
}
for (const { from, to, barrier } of report.broken) {
  console.log(`no link ${from} -> ${to}: ${barrier} is in the way`);
}
