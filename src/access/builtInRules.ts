// The access rule data shipped with the app (ADR 0024), generated from
// OpenStreetMap by scripts/prepare-access-data.mts. Passed into the core like
// the router: the core never loads data itself.
import type { AccessRules } from "@/core/access";
import type { AccessDataset, LockDataset } from "./dataset";
import brussels from "./data/brussels.json";
import flanders from "./data/flanders.json";
import locks from "./data/locks.json";
import regions from "./data/regions.json";

/** Every built-in dataset. JSON loses tuple types, hence the cast; the data test checks the shape. */
export const builtInDatasets: readonly AccessDataset[] = [regions, flanders, brussels] as unknown as AccessDataset[];

/** The lock markers of Flanders and Brussels (#57). */
export const builtInLocks: LockDataset = locks as unknown as LockDataset;

export const builtInAccessRules: AccessRules = { records: builtInDatasets.flatMap((dataset) => dataset.records) };
