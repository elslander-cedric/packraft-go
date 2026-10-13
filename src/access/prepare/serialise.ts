import type { AccessDataset } from "../dataset";

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
