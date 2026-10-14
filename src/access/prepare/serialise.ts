import type { AccessDataset, LockDataset } from "../dataset";

/** The lock markers as JSON with one lock per line. */
export function serialiseLocks(dataset: LockDataset): string {
  const { locks, ...rest } = dataset;
  const head = JSON.stringify({ ...rest, locks: "@@locks@@" }, null, 2);
  return head.replace('"@@locks@@"', `[\n${locks.map((l) => `    ${JSON.stringify(l)}`).join(",\n")}\n  ]`) + "\n";
}

/**
 * A dataset as JSON that reads well in a diff: fields indented, each geometry
 * on one line.
 */
export function serialiseDataset(dataset: AccessDataset): string {
  const geometries: string[] = [];
  const withPlaceholders = {
    ...dataset,
    records: dataset.records.map((record) => {
      geometries.push(JSON.stringify(record.geometry));
      return { ...record, geometry: `@@geometry-${geometries.length - 1}@@` };
    }),
  };
  return (
    JSON.stringify(withPlaceholders, null, 2).replace(/"@@geometry-(\d+)@@"/g, (_, i: string) => geometries[Number(i)]) +
    "\n"
  );
}
