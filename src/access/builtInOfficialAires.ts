// The official aires and stretches shipped with the app (ADR 0035), apart from the
// access rules: the planner wants them from a trip's first point, before any paddle
// leg, to offer a snap onto an aire, and they are small next to the rules.
import type { OfficialAire } from "@/core/officialAire";
import type { OfficialAireDataset, OfficialStretchDataset } from "./dataset";
import officialAires from "./data/official-aires.json";
import officialStretches from "./data/official-stretches.json";

/** The official stretches' ids and names (ADR 0035). */
export const builtInOfficialStretches: OfficialStretchDataset = officialStretches as unknown as OfficialStretchDataset;

const aireDataset = officialAires as unknown as OfficialAireDataset;

/** The official aires (ADR 0035), each with the snapshot's source and date. */
export const builtInOfficialAires: readonly OfficialAire[] = aireDataset.aires.map((aire) => ({
  ...aire,
  id: `official-aire-${aire.number}`,
  source: aireDataset.source,
  snapshot: aireDataset.snapshot,
}));
