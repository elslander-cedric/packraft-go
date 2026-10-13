// Fetches the OSM data for the Walloon stretches (#54) through the polite Overpass
// client, caching every answer under .cache/osm/ so re-runs don't re-fetch.
// Only the preparation script and the review server use this; never the app or tests.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createOverpassClient, type OverpassResult } from "../../src/dataprep/walloonStretches/overpass";
import { borderQuery, RIVERS, riverQuery } from "../../src/dataprep/walloonStretches/rivers";

export const ROOT = path.join(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(ROOT, ".cache", "osm");
const ENDPOINT = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

const keyFile = (query: string) =>
  path.join(CACHE_DIR, `${createHash("sha256").update(query).digest("hex").slice(0, 16)}.json`);

export type OsmData = { rivers: Record<string, OverpassResult>; border: OverpassResult };

/** OSM data for every river plus the national border. Cached answers are used when present. */
export async function loadOsmData({ offline = false } = {}): Promise<OsmData> {
  await mkdir(CACHE_DIR, { recursive: true });
  const client = createOverpassClient({
    endpoint: ENDPOINT,
    fetch: async (url, init) => {
      if (offline) throw new Error("OSM data is not cached and --offline was given");
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
  const rivers: Record<string, OverpassResult> = {};
  for (const config of RIVERS) {
    console.log(`OSM: ${config.river}`);
    rivers[config.river] = await client.query(riverQuery(config));
  }
  console.log("OSM: national border");
  const border = await client.query(borderQuery());
  return { rivers, border };
}
