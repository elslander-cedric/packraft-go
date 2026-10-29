// Live base map check (#179, ADR 0031): asks every base map and overlay (ADR 0032) source for one
// tile, so we notice when a service moves its URL or ends keyless access. Run by hand with
// `npm run check:basemaps`; never part of `npm test`, `npm run e2e` or CI (ADR 0019).
import { baseMaps, initialMapView, overlays, type Bounds, type LatLng, type TileSource } from "./mapConfig";

export type Tile = { z: number; x: number; y: number };

/** What the check needs from a response. */
export type TileResponse = { status: number; headers: Headers };

export type BaseMapCheckDeps = {
  fetch: (url: string, init: RequestInit) => Promise<TileResponse>;
  wait: (ms: number) => Promise<void>;
};

/** Pause between two requests: these are free public services. */
export const BASE_MAP_CHECK_DELAY_MS = 1500;

/** Who is asking: the project URL only, never a personal email. */
export const BASE_MAP_CHECK_USER_AGENT = "packraft-go-basemap-check (+https://github.com/elslander-cedric/packraft-go)";

// Half the width of the Web Mercator world, in metres.
const MERCATOR_HALF = 20037508.342789244;

/** The Web Mercator tile under a place at a zoom. */
export function tileAt(lat: number, lng: number, z: number): Tile {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    z,
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  };
}

/** A WMS GetMap for one 256 px tile in EPSG:3857, as Leaflet asks for it. */
export function wmsTileUrl(url: string, params: Extract<TileSource, { kind: "wms" }>["params"], { z, x, y }: Tile) {
  const size = (2 * MERCATOR_HALF) / 2 ** z;
  const query = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: params.version,
    layers: params.layers,
    styles: "",
    format: params.format,
    transparent: String(params.transparent),
    crs: "EPSG:3857",
    width: "256",
    height: "256",
    bbox: [
      x * size - MERCATOR_HALF,
      MERCATOR_HALF - (y + 1) * size,
      (x + 1) * size - MERCATOR_HALF,
      MERCATOR_HALF - y * size,
    ].join(","),
  });
  return `${url}?${query}`;
}

const centre = ([[south, west], [north, east]]: Bounds): LatLng => [(south + north) / 2, (west + east) / 2];

/**
 * The one request per source, the base maps' then the overlays': a tile in the middle of
 * its bounds, or under the map's initial centre.
 */
export function baseMapCheckRequests(): { label: string; url: string }[] {
  const seen = new Set<TileSource>();
  const requests: { label: string; url: string }[] = [];
  const named = [
    ...baseMaps.flatMap((map) => map.sources.map((source) => ({ name: map.name, source }))),
    ...overlays.map(({ name, source }) => ({ name, source })),
  ];
  for (const { name, source } of named) {
    if (seen.has(source)) continue;
    seen.add(source);
    const [lat, lng] = source.bounds ? centre(source.bounds) : initialMapView.center;
    const tile = tileAt(lat, lng, source.bounds ? 15 : 12);
    const url =
      source.kind === "wms"
        ? wmsTileUrl(source.url, source.params, tile)
        : source.url
            .replace("{s}", source.subdomains?.[0] ?? "")
            .replace("{z}", String(tile.z))
            .replace("{x}", String(tile.x))
            .replace("{y}", String(tile.y));
    requests.push({ label: `${name}: ${new URL(url).hostname}`, url });
  }
  return requests;
}

/** Asks each source for its tile, one at a time; OK for an image, FAILED otherwise. */
export async function runBaseMapCheck({ fetch, wait }: BaseMapCheckDeps): Promise<{ passed: boolean; report: string }> {
  const lines: string[] = [];
  let passed = true;
  const requests = baseMapCheckRequests();
  for (const [i, { label, url }] of requests.entries()) {
    if (i > 0) await wait(BASE_MAP_CHECK_DELAY_MS);
    let problem: string | null;
    try {
      const response = await fetch(url, { headers: { "User-Agent": BASE_MAP_CHECK_USER_AGENT } });
      const type = response.headers.get("content-type") ?? "";
      problem =
        response.status !== 200
          ? `HTTP ${response.status}`
          : type.startsWith("image/")
            ? null
            : `not an image (${type || "no content type"})`;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    if (problem) passed = false;
    lines.push(problem ? `FAILED ${label}: ${problem}\n       ${url}` : `OK     ${label}`);
  }
  return { passed, report: lines.join("\n") };
}
