// Manual check against the live PKAYAK map service (#218).
// Run with `npm run check:kayak`. Never part of `npm test`, `npm run e2e` or CI (ADR 0019).
// Makes four requests, one at a time with a pause between them, no retries, and only
// reads the fixtures: it never rewrites them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runKayakCheck } from "../src/kayak/liveCheck";

const fixturesDir = path.join(import.meta.dirname, "..", "src", "kayak", "fixtures");

const result = await runKayakCheck({
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  wait: async (ms) => {
    await sleep(ms);
  },
  readFixture: (name) => readFileSync(path.join(fixturesDir, name), "utf8"),
});

console.log("Live PKAYAK check against the recorded fixtures in src/kayak/fixtures/");
console.log(result.report);
process.exitCode = result.passed ? 0 : 1;
