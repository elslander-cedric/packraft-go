// Prepares the built-in route network for suggested trips (ADR 0039): the official aires as
// nodes and the paddle links between them, from the Walloon stretch records, their OSM ways,
// the obstacles and the locks. Manual only: never run by `npm test`, `npm run e2e` or CI.
// Review the diff of src/access/data/route-network.json and the report before committing.
//
//   npm run prepare:route-network              # reuses cached Overpass answers
//   npm run prepare:route-network -- --offline # refuses to ask Overpass
//
// Politeness: one Overpass request at a time with a pause between them, identified by the
// project URL only, every answer cached in .cache/route-network-osm/ (git-ignored).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { LockDataset, ObstacleDataset, OfficialAireDataset } from "../src/access/dataset";
import { dateInBrussels } from "../src/core/calendarDate";
import { buildRouteNetwork, type NetworkInputs } from "../src/dataprep/routeNetwork/build";
import { recordQuery } from "../src/dataprep/routeNetwork/overpass";
import { serialiseRouteNetwork } from "../src/dataprep/routeNetwork/serialise";
import { createOverpassClient, type OverpassResult } from "../src/dataprep/walloonStretches/overpass";

const ROOT = path.join(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache", "route-network-osm");
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

const keyFile = (query: string) =>
  path.join(CACHE_DIR, `${createHash("sha256").update(query).digest("hex").slice(0, 16)}.json`);
await mkdir(CACHE_DIR, { recursive: true });
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
  ],
  snapshot: today,
};

const { network, report } = buildRouteNetwork(inputs);
await writeFile(OUT, serialiseRouteNetwork(network));
console.log(`\nWrote src/access/data/route-network.json: ${network.nodes.length} nodes, ${network.paddleLinks.length} paddle links`);

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
