// The access rule data shipped with the app (ADR 0024), generated from
// OpenStreetMap by scripts/prepare-access-data.mts. Passed into the core like
// the router: the core never loads data itself.
import type { AccessRules } from "@/core/access";
import type { AccessDataset } from "./dataset";
import flanders from "./data/flanders.json";
import regions from "./data/regions.json";

/** Every built-in dataset. JSON loses tuple types, hence the cast; the data test checks the shape. */
export const builtInDatasets: readonly AccessDataset[] = [regions, flanders] as unknown as AccessDataset[];

export const builtInAccessRules: AccessRules = { records: builtInDatasets.flatMap((dataset) => dataset.records) };
