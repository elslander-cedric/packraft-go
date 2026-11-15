// Walking links (ADR 0039): between nodes close enough to walk, routed by BRouter preferring
// waymarked trails. Pure: the script (scripts/prepare-route-network.mts) asks BRouter, one
// request at a time, and caches the answers.
import { z } from "zod";
import type { Position } from "@/core/geo";
import type { RouteNode, WalkingLink } from "@/core/routeNetwork";
import { brouterUrl, TRAIL_PREFERENCE } from "@/routing/brouter";
import { wayShares } from "@/routing/wayShares";
import { distanceM, simplify, type Pt } from "../walloonStretches/geo";

/** The longest walking link; a longer walk passes through a node. */
export const WALKING_CEILING_M = 15_000;
/** Simplification of a link's line, in metres: enough to draw it on the map. */
const LINE_TOLERANCE_M = 15;

export type WalkingPair = { readonly from: RouteNode; readonly to: RouteNode };
/** A BRouter answer as the script receives and caches it. */
export type BRouterAnswer = { readonly status: number; readonly body: string };

const toPt = ([lng, lat]: readonly number[]): Pt => ({ lat, lng });
const byId = (a: RouteNode, b: RouteNode) =>
  a.id.localeCompare(b.id, "en", { numeric: true });

/**
 * Every two nodes no further apart as the crow flies than a walking link may be long,
 * once, `from` first by id: a walk can't be shorter than the crow flies.
 */
export function walkingPairs(nodes: readonly RouteNode[]): WalkingPair[] {
  const sorted = [...nodes].sort(byId);
  return sorted.flatMap((from, i) =>
    sorted
      .slice(i + 1)
      .filter(
        (to) =>
          distanceM(toPt(from.position), toPt(to.position)) <=
          WALKING_CEILING_M,
      )
      .map((to) => ({ from, to })),
  );
}

export function walkingUrl({ from, to }: WalkingPair): string {
  const points = [from, to].map(({ position: [lng, lat] }) => ({ lat, lng }));
  return brouterUrl("hike", points, { trailPreference: TRAIL_PREFERENCE });
}

const answerSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          "track-length": z.coerce.number(),
          "filtered ascend": z.coerce.number(),
        }),
        geometry: z.object({
          coordinates: z.array(z.array(z.number()).min(2)).min(2),
        }),
      }),
    )
    .min(1),
});

const round = (value: number, decimals: number) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

function drawn(coordinates: readonly number[][]): Position[] {
  return simplify(coordinates.map(toPt), LINE_TOLERANCE_M)
    .map(({ lng, lat }): Position => [round(lng, 5), round(lat, 5)])
    .filter((point, i, all) => i === 0 || point.join() !== all[i - 1].join());
}

/** The walking link BRouter's answer gives, or none when it found no route or the walk is too long. */
export function walkingLink(
  pair: WalkingPair,
  answer: BRouterAnswer,
): WalkingLink | undefined {
  if (answer.status !== 200) {
    return undefined;
  }
  const json: unknown = JSON.parse(answer.body);
  const parsed = answerSchema.safeParse(json);
  const shares = wayShares(json);
  if (!parsed.success || !shares) {
    return undefined;
  }
  const [{ properties, geometry }] = parsed.data.features;
  const distance = properties["track-length"];
  if (distance > WALKING_CEILING_M) {
    return undefined;
  }
  const coordinates = geometry.coordinates;
  // BRouter reports a smoothed climb only; what goes up and doesn't end higher came down.
  const rise = (coordinates.at(-1)?.[2] ?? 0) - (coordinates[0][2] ?? 0);
  const climbM = properties["filtered ascend"];
  return {
    from: pair.from.id,
    to: pair.to.id,
    distanceM: Math.round(distance),
    climbM: Math.round(climbM),
    descentM: Math.max(0, Math.round(climbM - rise)),
    trailShare: round(shares.trailShare, 2),
    roadShare: round(shares.roadShare, 2),
    line: drawn(coordinates),
  };
}
