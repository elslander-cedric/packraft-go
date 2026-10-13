// Prepares the built-in access data from OpenStreetMap (ADR 0024). Manual and
// offline only: never run by `npm test`, `npm run e2e` or CI, and the app never
// queries OpenStreetMap at runtime.
//
//   npm run prepare:access-data            # uses cached answers when present
//   npm run prepare:access-data -- --fresh # asks Overpass again
//
// Politeness: one request at a time with a pause between them, identified by
// the project URL only; answers are cached in .cache/access-osm/ (git-ignored),
// so re-running costs the Overpass servers nothing.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAccessData } from "../src/access/prepare/build";
import { serialiseDataset } from "../src/access/prepare/serialise";
import type { OverpassResponse } from "../src/access/prepare/osm";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache", "access-osm");
const OUT = path.join(ROOT, "src", "access", "data");
const USER_AGENT = "packraft-go (+https://github.com/elslander-cedric/packraft-go)";
// Public Overpass instances, tried in turn when one is busy.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const PAUSE_MS = 2000;
const fresh = process.argv.includes("--fresh");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function overpass(query: string): Promise<OverpassResponse> {
  const file = path.join(CACHE, `${createHash("sha256").update(query).digest("hex").slice(0, 16)}.json`);
  if (!fresh && existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as OverpassResponse;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    await sleep(PAUSE_MS * (1 + attempt));
    console.log(`Overpass (${new URL(endpoint).hostname}): ${query.split("\n")[1].slice(0, 100)}`);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(200_000),
    }).catch((error: unknown) => {
      console.log(`  ${String(error)}; trying again after a pause`);
      return null;
    });
    if (!response) continue;
    if (response.ok) {
      const text = await response.text();
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(file, text);
      return JSON.parse(text) as OverpassResponse;
    }
    console.log(`  ${response.status}; trying again after a pause`);
  }
  throw new Error("Overpass didn't answer; try again later");
}

const today = new Date().toISOString().slice(0, 10);
for (const dataset of await buildAccessData(overpass, today)) {
  const file = path.join(OUT, `${dataset.id}.json`);
  writeFileSync(file, serialiseDataset(dataset));
  console.log(`Wrote ${path.relative(ROOT, file)}: ${dataset.records.length} records`);
}
