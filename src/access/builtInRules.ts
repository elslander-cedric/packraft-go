// The access rule data shipped with the app (ADR 0024), generated from
// OpenStreetMap by scripts/prepare-access-data.mts (regions, Flanders) and
// scripts/walloon-stretches (the Walloon stretches, #54). Passed into the core
// like the router: the core never loads data itself.
import walloonStretches from "@/data/walloon-stretches.json";
import type { AccessRules } from "@/core/access";
import type { AccessDataset, LockDataset } from "./dataset";
import brussels from "./data/brussels.json";
import flanders from "./data/flanders.json";
import locks from "./data/locks.json";
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

export const builtInAccessRules: AccessRules = { records: builtInDatasets.flatMap((dataset) => dataset.records) };
