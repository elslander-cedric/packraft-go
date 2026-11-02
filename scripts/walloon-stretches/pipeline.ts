// Shared by the build script and the review server (#54): load inputs, build, and
// write the shipped dataset when nothing needs review.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildStretches, endsNeedingReview, type AnnexRow, type ReviewDecisions } from "../../src/dataprep/walloonStretches/build";
import { toDataset } from "../../src/dataprep/walloonStretches/dataset";
import { rejoinSplits, splitAtOfficialBoundaries, splitBoundaryEnds, type OfficialLines } from "../../src/dataprep/walloonStretches/official";
import { STRETCH_RECIPES } from "../../src/dataprep/walloonStretches/recipes";
import { RIVERS } from "../../src/dataprep/walloonStretches/rivers";
import { loadOsmData, ROOT } from "./osmCache";

export const ANNEX_PATH = path.join(ROOT, "docs", "research", "data", "walloon-stretches.json");
/** Cedric's review decisions, committed so the build is reproducible. */
export const REVIEW_PATH = path.join(ROOT, "docs", "research", "data", "walloon-stretches-review.json");
export const FINAL_PATH = path.join(ROOT, "src", "data", "walloon-stretches.json");
/** The SPW's lines, from `npm run prepare:spw-data`: what the official stretch mapping is reviewed on (#209). */
export const SPW_LINES_PATH = path.join(ROOT, "docs", "research", "data", "spw-stretch-lines.json");

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

export type SpwLines = { stretches: { id: string; parts: Array<Array<[number, number]>> }[] };

export async function readSpwLines(): Promise<{ raw: SpwLines; lines: OfficialLines }> {
  const raw: SpwLines = JSON.parse(await readFile(SPW_LINES_PATH, "utf8"));
  const lines = Object.fromEntries(raw.stretches.map(({ id, parts }) => [id, parts.map((part) => part.map(([lng, lat]) => ({ lat, lng })))]));
  return { raw, lines };
}

/**
 * The whole records, before the split. `shipped` takes them from the shipped dataset
 * instead of OSM: what re-cutting a split needs, and it leaves every line as it is.
 */
async function wholeRecords(annex: AnnexRow[], decisions: ReviewDecisions, { offline = false, shipped = false }) {
  if (shipped) {
    const { stretches } = JSON.parse(await readFile(FINAL_PATH, "utf8"));
    return { stretches: rejoinSplits(stretches, annex), problems: [] };
  }
  const osm = await loadOsmData({ offline });
  return buildStretches({ annex, rivers: RIVERS, recipes: STRETCH_RECIPES, osm, review: decisions });
}

export async function buildDataset({ offline = false, shipped = false } = {}) {
  const annex: AnnexRow[] = JSON.parse(await readFile(ANNEX_PATH, "utf8"));
  const review = await readReview();
  const whole = await wholeRecords(annex, review.decisions, { offline, shipped });
  const { problems } = whole;
  const stretches = splitAtOfficialBoundaries(whole.stretches, review.decisions);
  const count = Object.keys(review.decisions).length;
  const needingReview = endsNeedingReview(stretches);
  // A split boundary ships while it waits for review, and the data says so.
  const pending = needingReview.filter((end) => splitBoundaryEnds().includes(end));
  const draft = toDataset(
    stretches,
    review.reviewedAt && count > 0
      ? { reviewedBy: REVIEWER, reviewedAt: review.reviewedAt, decisions: count, ...(pending.length > 0 ? { pending } : {}) }
      : undefined,
  );
  let finalPath: string | undefined;
  if (needingReview.length === pending.length && problems.length === 0) {
    await mkdir(path.dirname(FINAL_PATH), { recursive: true });
    await writeFile(FINAL_PATH, JSON.stringify(draft) + "\n");
    finalPath = FINAL_PATH;
  }
  return { draft, needingReview, problems, finalPath };
}
