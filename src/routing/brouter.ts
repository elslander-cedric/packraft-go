// BRouter adapter: implements the core's Router interface with the public
// BRouter server (ADR 0014). It is the only module that talks to BRouter.
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
  const lonlats = points.map((p) => `${p.lng},${p.lat}`).join("|");
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
      if (response.status === 400) return NO_ROUTE;
      if (!response.ok) return UNAVAILABLE;
      try {
        return toRouteResult(JSON.parse(await response.text()));
      } catch {
        return UNAVAILABLE;
      }
    },
  };
}

type Position = [lng: number, lat: number, elevation?: number];

function toRouteResult(geojson: unknown): RouteResult {
  const coordinates = (geojson as { features?: { geometry?: { coordinates?: unknown } }[] })
    .features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return UNAVAILABLE;
  if (coordinates.length < 2) return NO_ROUTE;
  return { ok: true, geometry: withElevations(coordinates as Position[]) };
}

/**
 * BRouter leaves out the elevation where it has no height data (e.g. at sea).
 * Such points take the elevation of the nearest earlier point that has one,
 * or failing that the nearest later one, or 0 if no point has any.
 */
function withElevations(positions: readonly Position[]): RoutedPoint[] {
  const known = (p: Position) => typeof p[2] === "number";
  const firstKnown = positions.find(known)?.[2] ?? 0;
  let last = firstKnown;
  return positions.map(([lng, lat, elevation]) => {
    if (typeof elevation === "number") last = elevation;
    return { lat, lng, elevation: last };
  });
}
