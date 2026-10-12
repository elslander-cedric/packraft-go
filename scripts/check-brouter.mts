// Manual check against the live public BRouter server (issue #29).
// Run with `npm run check:brouter`. Never part of `npm test`, `npm run e2e` or CI (ADR 0019).
// Makes at most four requests, one at a time with a pause between them, and only reads
// the fixtures: it never rewrites them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runLiveCheck } from "../src/routing/liveCheck";

const fixturesDir = path.join(import.meta.dirname, "..", "src", "routing", "fixtures");

const result = await runLiveCheck({
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  wait: async (ms) => {
    await sleep(ms);
  },
  readFixture: (name) => readFileSync(path.join(fixturesDir, name), "utf8"),
});

console.log("Live BRouter check against the recorded fixtures in src/routing/fixtures/");
console.log(result.report);
process.exitCode = result.passed ? 0 : 1;
