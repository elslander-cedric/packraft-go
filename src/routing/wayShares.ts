// Trail share and road share of a walk routed by BRouter (ADR 0039), read from the
// GeoJSON `messages` table: a header row, then one row per stretch of the track with
// its `Distance` in metres and the OSM tags of its way (`WayTags`).
import { z } from "zod";

/** OSM `highway` values that count as walking on a road. */
const ROAD_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
]);

const messagesSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({ messages: z.array(z.array(z.string())).min(1) }),
      }),
    )
    .min(1),
});

/**
 * - `trailShare`: share of the distance on a way of a hiking route relation
 *   (BRouter's `route_hiking_iwn/nwn/rwn/lwn` tags), the same ways `hiking-mountain` prefers.
 * - `roadShare`: share of the distance on a road (`ROAD_HIGHWAYS`).
 *
 * A waymarked route along a road counts in both.
 */
export type WayShares = {
  lengthM: number;
  trailShare: number;
  roadShare: number;
};

/** The shares of a BRouter GeoJSON answer, or null when its messages don't carry them. */
export function wayShares(geojson: unknown): WayShares | null {
  const parsed = messagesSchema.safeParse(geojson);
  if (!parsed.success) {
    return null;
  }
  const [header, ...rows] = parsed.data.features[0].properties.messages;
  const distanceColumn = header.indexOf("Distance");
  const tagsColumn = header.indexOf("WayTags");
  if (distanceColumn < 0 || tagsColumn < 0) {
    return null;
  }

  let lengthM = 0;
  let trailM = 0;
  let roadM = 0;
  for (const row of rows) {
    const distance = Number(row[distanceColumn]);
    const tags = (row[tagsColumn] ?? "").split(" ");
    lengthM += distance;
    if (tags.some((tag) => tag.startsWith("route_hiking_"))) {
      trailM += distance;
    }
    const highway = tags.find((tag) => tag.startsWith("highway="))?.slice("highway=".length);
    if (highway !== undefined && ROAD_HIGHWAYS.has(highway)) {
      roadM += distance;
    }
  }
  if (!(lengthM > 0)) {
    return null;
  }
  return { lengthM, trailShare: trailM / lengthM, roadShare: roadM / lengthM };
}
