// BRouter adapter: implements the core's Router interface with the public
// BRouter server (ADR 0014). It is the only module that talks to BRouter.
import { z } from "zod";
import type { RouteResult, RoutedPoint, Router } from "@/core/router";
import type { LatLng, LegMode } from "@/core/trip";

const PUBLIC_SERVER = "https://brouter.de/brouter";

/** BRouter profile per leg mode. `hiking-mountain` is the public server's walking profile. */
const profiles: Record<LegMode, string> = {
  hike: "hiking-mountain",
  paddle: "river",
};

type Fetch = (input: string) => Promise<Response>;

export type BRouterOptions = {
  /** Injected for tests; defaults to the browser's fetch. */
  fetch?: Fetch;
  serverUrl?: string;
};

const NO_ROUTE: RouteResult = { ok: false, failure: { kind: "no-route" } };
const UNAVAILABLE: RouteResult = { ok: false, failure: { kind: "unavailable" } };

export function brouterUrl(mode: LegMode, points: readonly LatLng[], serverUrl = PUBLIC_SERVER): string {
  const lonlats = points.map((point) => `${point.lng},${point.lat}`).join("|");
  return `${serverUrl}?lonlats=${lonlats}&profile=${profiles[mode]}&alternativeidx=0&format=geojson`;
}

export function createBRouterRouter(options: BRouterOptions = {}): Router {
  const fetchFn: Fetch = options.fetch ?? ((input) => fetch(input));
  return {
    async route(mode, points) {
      let response: Response;
      try {
        response = await fetchFn(brouterUrl(mode, points, options.serverUrl));
      } catch {
        return UNAVAILABLE;
      }
      // BRouter reports routing problems (unmapped points, islands) as 400 with a text message.
      if (response.status === 400) {
        return NO_ROUTE;
      }
      if (!response.ok) {
        return UNAVAILABLE;
      }
      try {
        return toRouteResult(JSON.parse(await response.text()));
      } catch {
        return UNAVAILABLE;
      }
    },
  };
}

/** Longitude, latitude and, where BRouter has height data, elevation. */
const positionSchema = z.tuple([z.number(), z.number()], z.number());
type Position = z.infer<typeof positionSchema>;

/** The first feature of BRouter's GeoJSON is the route. */
const routeSchema = z.object({
  features: z.tuple(
    [
      z.object({
        properties: z.record(z.string(), z.unknown()).optional(),
        geometry: z.object({ coordinates: z.array(positionSchema) }),
      }),
    ],
    z.unknown(),
  ),
});

function toRouteResult(geojson: unknown): RouteResult {
  const route = routeSchema.safeParse(geojson);
  if (!route.success) {
    return UNAVAILABLE;
  }
  const [{ geometry, properties }] = route.data.features;
  if (geometry.coordinates.length < 2) {
    return NO_ROUTE;
  }
  const points = withElevations(geometry.coordinates);
  // BRouter's smoothed climb ("filtered ascend", whole metres, sent as a string).
  const climbM = Number.parseFloat(String(properties?.["filtered ascend"]));
  return Number.isFinite(climbM) ? { ok: true, geometry: points, climbM } : { ok: true, geometry: points };
}

/**
 * BRouter leaves out the elevation where it has no height data (e.g. at sea).
 * Such points take the elevation of the nearest earlier point that has one,
 * or failing that the nearest later one, or 0 if no point has any.
 */
function withElevations(positions: readonly Position[]): RoutedPoint[] {
  const hasElevation = (position: Position) => typeof position[2] === "number";
  const firstKnown = positions.find(hasElevation)?.[2] ?? 0;
  let last = firstKnown;
  return positions.map(([lng, lat, elevation]) => {
    if (typeof elevation === "number") {
      last = elevation;
    }
    return { lat, lng, elevation: last };
  });
}
