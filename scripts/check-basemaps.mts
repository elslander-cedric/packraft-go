// Manual check of the base maps' live sources (#179, ADR 0031).
// Run with `npm run check:basemaps`. Never part of `npm test`, `npm run e2e` or CI (ADR 0019).
// One tile request per source, one at a time with a pause between them, no retries.
import { setTimeout as sleep } from "node:timers/promises";
import { runBaseMapCheck } from "../src/map/baseMapCheck";

const result = await runBaseMapCheck({
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  wait: async (ms) => {
    await sleep(ms);
  },
});

console.log("Live base map check: one tile per source");
console.log(result.report);
process.exitCode = result.passed ? 0 : 1;
