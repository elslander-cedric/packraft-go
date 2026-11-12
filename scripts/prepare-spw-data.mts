// Prepares the built-in SPW snapshots from the PKAYAK map service (ADR 0035). Manual
// only: never run by `npm test`, `npm run e2e` or CI, and the app never queries these
// layers for this data at runtime. Review the diff of src/access/data/ before committing.
//
//   npm run prepare:spw-data
//
// Politeness: one light GET at a time with a pause between them and no retries,
// identified by the project URL only. Writes nothing unless every layer checks out.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { serialiseSnapshot } from "../src/access/prepare/serialise";
import { dateInBrussels } from "../src/core/calendarDate";
import {
  AIRE_FIELDS,
  buildObstacles,
  buildOfficialAires,
  buildOfficialLines,
  buildOfficialStretches,
  OBSTACLE_FIELDS,
  PKAYAK_LAYERS,
  pkayakQuery,
  STRETCH_FIELDS,
  type PkayakAnswer,
} from "../src/access/prepare/spw";

const OUT = path.resolve(import.meta.dirname, "..", "src", "access", "data");
const LINES_OUT = path.resolve(import.meta.dirname, "..", "docs", "research", "data", "spw-stretch-lines.json");
const USER_AGENT = "packraft-go (+https://github.com/elslander-cedric/packraft-go)";
const PAUSE_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchLayer(url: string): Promise<PkayakAnswer> {
  console.log(`PKAYAK: ${url}`);
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`PKAYAK answered ${response.status}`);
  }
  const answer = (await response.json()) as PkayakAnswer & { error?: unknown };
  // The service reports its errors with status 200.
  if (answer.error) {
    throw new Error(`PKAYAK answered ${JSON.stringify(answer.error)}`);
  }
  return answer;
}

const today = dateInBrussels(Date.now());

const stretchAnswer = await fetchLayer(pkayakQuery(PKAYAK_LAYERS.stretches, STRETCH_FIELDS));
const stretches = buildOfficialStretches(stretchAnswer, today);
const lines = buildOfficialLines(stretchAnswer, today);
await sleep(PAUSE_MS);
const aires = buildOfficialAires(await fetchLayer(pkayakQuery(PKAYAK_LAYERS.aires, AIRE_FIELDS)), stretches, today);
await sleep(PAUSE_MS);
const obstacles = buildObstacles(await fetchLayer(pkayakQuery(PKAYAK_LAYERS.obstacles, OBSTACLE_FIELDS)), today);

const outputs = [
  {
    file: "official-stretches.json",
    content: serialiseSnapshot(stretches, "stretches"),
    count: stretches.stretches.length,
  },
  { file: "official-aires.json", content: serialiseSnapshot(aires, "aires"), count: aires.aires.length },
  { file: "obstacles.json", content: serialiseSnapshot(obstacles, "obstacles"), count: obstacles.obstacles.length },
];
for (const { file, content, count } of outputs) {
  writeFileSync(path.join(OUT, file), content);
  console.log(`Wrote src/access/data/${file}: ${count} records`);
}
// Not shipped: what the Walloon stretch mapping is checked against and reviewed on (#209).
writeFileSync(LINES_OUT, serialiseSnapshot(lines, "stretches"));
console.log(`Wrote ${path.relative(process.cwd(), LINES_OUT)}: ${lines.stretches.length} lines`);
