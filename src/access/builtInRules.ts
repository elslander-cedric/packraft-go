// The access rule data shipped with the app (ADR 0024), generated from
// OpenStreetMap by scripts/prepare-access-data.mts (regions, Flanders) and
// scripts/walloon-stretches (the Walloon stretches, #54). Passed into the core
// like the router: the core never loads data itself.
import walloonStretches from "@/data/walloon-stretches.json";
import type { AccessRules } from "@/core/access";
import type { Obstacle } from "@/core/obstacle";
import type { OfficialAire } from "@/core/officialAire";
import type { AccessDataset, LockDataset, ObstacleDataset, OfficialAireDataset, OfficialStretchDataset } from "./dataset";
import brussels from "./data/brussels.json";
import flanders from "./data/flanders.json";
import locks from "./data/locks.json";
import obstacles from "./data/obstacles.json";
import officialAires from "./data/official-aires.json";
import officialStretches from "./data/official-stretches.json";
import regions from "./data/regions.json";
import { walloonDataset, type WalloonStretchData } from "./walloon";

/**
 * Every built-in dataset. JSON loses tuple types, hence the casts; the data
 * test checks the shape. The Walloon stretches are converted to access records
 * here, so their file is not copied.
 */
export const builtInDatasets: readonly AccessDataset[] = [
  ...([regions, flanders, brussels] as unknown as AccessDataset[]),
  walloonDataset(walloonStretches as unknown as WalloonStretchData),
];

/** The lock markers of Flanders and Brussels (#57). */
export const builtInLocks: LockDataset = locks as unknown as LockDataset;

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

const obstacleDataset = obstacles as unknown as ObstacleDataset;

/** The obstacles (ADR 0035), each with the snapshot's source and date. */
export const builtInObstacles: readonly Obstacle[] = obstacleDataset.obstacles.map((obstacle) => ({
  ...obstacle,
  id: `obstacle-${obstacle.spwId}`,
  source: obstacleDataset.source,
  snapshot: obstacleDataset.snapshot,
}));

export const builtInAccessRules: AccessRules = { records: builtInDatasets.flatMap((dataset) => dataset.records) };
