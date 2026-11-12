// The shape of the two KiWIS answers the app reads (docs/research/hydrometry.md). The app and
// the live check (`npm run check:kiwis`) both read them through these schemas.
import { z } from "zod";

/** `getTimeseriesList`: a table whose first row names the columns. */
export const seriesTableSchema = z.tuple([z.array(z.string())], z.array(z.unknown()));

/** One reading: when, and the flow in m³/s, or null where the gauge has none. */
export const readingRowSchema = z.tuple([z.string(), z.number().nullable()]);

/** `getTimeseriesValues`: one entry per series, exactly as the app asks for it. */
export const valuesSchema = z.array(
  z.object({
    ts_id: z.string(),
    columns: z.literal("Timestamp,Value"),
    data: z.array(readingRowSchema),
  }),
);
export type ValuesAnswer = z.infer<typeof valuesSchema>;

/** Where each column the app needs sits in the series table, or null when one is missing. */
export function seriesColumns(header: readonly string[]) {
  const [station, id, name] = ["station_no", "ts_id", "ts_name"].map((column) => header.indexOf(column));
  return station < 0 || id < 0 || name < 0 ? null : { station, id, name };
}
