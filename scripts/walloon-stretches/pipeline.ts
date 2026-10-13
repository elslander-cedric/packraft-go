// Shared by the build script and the review server (#54): load inputs, build, and
// write the shipped dataset when nothing needs review.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildStretches, endsNeedingReview, type AnnexRow, type ReviewDecisions } from "../../src/dataprep/walloonStretches/build";
import { toDataset } from "../../src/dataprep/walloonStretches/dataset";
import { STRETCH_RECIPES } from "../../src/dataprep/walloonStretches/recipes";
import { RIVERS } from "../../src/dataprep/walloonStretches/rivers";
import { loadOsmData, ROOT } from "./osmCache";

export const ANNEX_PATH = path.join(ROOT, "docs", "research", "data", "walloon-stretches.json");
/** Cedric's review decisions, committed so the build is reproducible. */
export const REVIEW_PATH = path.join(ROOT, "docs", "research", "data", "walloon-stretches-review.json");
export const FINAL_PATH = path.join(ROOT, "src", "data", "walloon-stretches.json");

/** Only Cedric reviews end points (ADR 0024). */
const REVIEWER = "Cedric";

export type ReviewFile = { reviewedAt?: string; decisions: ReviewDecisions };

export async function readReview(): Promise<ReviewFile> {
  try {
    return JSON.parse(await readFile(REVIEW_PATH, "utf8"));
  } catch {
    return { decisions: {} };
  }
}

export async function writeReview(review: ReviewFile): Promise<void> {
  await writeFile(REVIEW_PATH, JSON.stringify(review, null, 2) + "\n");
}

export async function buildDataset({ offline = false } = {}) {
  const annex: AnnexRow[] = JSON.parse(await readFile(ANNEX_PATH, "utf8"));
  const review = await readReview();
  const osm = await loadOsmData({ offline });
  const { stretches, problems } = buildStretches({ annex, rivers: RIVERS, recipes: STRETCH_RECIPES, osm, review: review.decisions });
  const count = Object.keys(review.decisions).length;
  const draft = toDataset(
    stretches,
    review.reviewedAt && count > 0 ? { reviewedBy: REVIEWER, reviewedAt: review.reviewedAt, decisions: count } : undefined,
  );
  const needingReview = endsNeedingReview(stretches);
  let finalPath: string | undefined;
  if (needingReview.length === 0 && problems.length === 0) {
    await mkdir(path.dirname(FINAL_PATH), { recursive: true });
    await writeFile(FINAL_PATH, JSON.stringify(draft) + "\n");
    finalPath = FINAL_PATH;
  }
  return { draft, needingReview, problems, finalPath };
}
