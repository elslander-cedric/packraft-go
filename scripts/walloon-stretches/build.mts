// Prepares the Walloon stretch geometry (#54, ADR 0024). Run with `npm run data:walloon-stretches`.
// Manual only: never part of `npm test`, `npm run e2e` or CI.
//
// 1. Loads OSM data for every river (cached in .cache/osm/; only missing answers are fetched,
//    politely, one request at a time).
// 2. Builds each stretch from Annex 1/2 data, the end-point recipes and the review decisions.
// 3. Always writes the draft to .cache/walloon-stretches.draft.json (what the review page shows).
// 4. Writes the shipped dataset to src/data/walloon-stretches.json only when no end needs review.
//
// Pass --offline to use only cached OSM data.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDataset } from "./pipeline";

const offline = process.argv.includes("--offline");
const { draft, finalPath, needingReview, problems } = await buildDataset({ offline });

console.log(`\n${draft.stretches.length} stretches built.`);
for (const p of problems) console.log(`  problem: ${p}`);
const draftPath = path.join(import.meta.dirname, "..", "..", ".cache", "walloon-stretches.draft.json");
await writeFile(draftPath, JSON.stringify(draft, null, 1) + "\n");
console.log(`Draft written to ${path.relative(process.cwd(), draftPath)}`);
if (needingReview.length > 0) {
  console.log(`${needingReview.length} end points need review: ${needingReview.join(", ")}`);
  console.log("Open the review page with `npm run review:walloon-stretches`. The shipped dataset was not written.");
} else {
  console.log(`No end point needs review. Shipped dataset written to ${path.relative(process.cwd(), finalPath!)}`);
}
