// Manual check against the live KiWIS hydrometry service (issue #64).
// Run with `npm run check:kiwis`. Never part of `npm test`, `npm run e2e` or CI (ADR 0019).
// Makes two requests, one at a time with a pause between them, no retries, and only
// reads the fixtures: it never rewrites them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runKiwisCheck } from "../src/hydrometry/liveCheck";

const fixturesDir = path.join(import.meta.dirname, "..", "src", "hydrometry", "fixtures");

const result = await runKiwisCheck({
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  wait: async (ms) => {
    await sleep(ms);
  },
  readFixture: (name) => readFileSync(path.join(fixturesDir, name), "utf8"),
});

console.log("Live KiWIS check against the recorded fixtures in src/hydrometry/fixtures/");
console.log(result.report);
process.exitCode = result.passed ? 0 : 1;
