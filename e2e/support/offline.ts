import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { BaseMapId } from "../../src/core/settings";

const TILE_FIXTURE = readFileSync(path.join(__dirname, "../fixtures/tile.png"));
const BROUTER_FIXTURES = path.join(__dirname, "../../src/routing/fixtures");

/** Where a map tile comes from: OpenTopoMap, one region's aerial photos or the NGI's topo map. */
export type TileSource = "opentopomap" | "wallonia" | "flanders" | "brussels" | "ngi";

/**
 * One map tile the page asked for, with its source and the base map that source belongs to
 * (OpenTopoMap tiles are OpenTopoMap's, even when drawn under a Belgian base map).
 */
export type TileRequest = { z: number; x: number; y: number; source: TileSource; baseMap: BaseMapId };

const baseMapOf: Record<TileSource, BaseMapId> = {
  opentopomap: "opentopomap",
  wallonia: "aerial-be",
  flanders: "aerial-be",
  brussels: "aerial-be",
  ngi: "ngi-topo",
};

// Half the width of the Web Mercator world, in metres.
const MERCATOR_HALF = 20037508.342789244;

/** The tile a WMS GetMap in EPSG:3857 asks for, from its BBOX (minx,miny,maxx,maxy). */
function wmsTile(url: URL): Omit<TileRequest, "source" | "baseMap"> | null {
  const bbox = (url.searchParams.get("bbox") ?? url.searchParams.get("BBOX"))?.split(",").map(Number);
  if (bbox?.length !== 4 || bbox.some((n) => !Number.isFinite(n))) return null;
  const [minX, , maxX, maxY] = bbox;
  const width = maxX - minX;
  return {
    z: Math.round(Math.log2((2 * MERCATOR_HALF) / width)),
    x: Math.round((minX + MERCATOR_HALF) / width),
    y: Math.round((MERCATOR_HALF - maxY) / width),
  };
}

/** The source of a map tile drawn on the page (an image's `src`), or null for anything else. */
export const tileSourceOf = (src: string): TileSource | null => tileRequest(new URL(src))?.source ?? null;

/** The map tile this URL asks for, or null when it isn't one of the base maps' tile requests. */
function tileRequest(url: URL): TileRequest | null {
  const tile = (source: TileSource, z: string, x: string, y: string): TileRequest => ({
    z: Number(z),
    x: Number(x),
    y: Number(y),
    source,
    baseMap: baseMapOf[source],
  });
  const param = (name: string) => url.searchParams.get(name) ?? url.searchParams.get(name.toLowerCase());
  let match: RegExpMatchArray | null;
  if (url.hostname.endsWith("tile.opentopomap.org") && (match = url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/)))
    return tile("opentopomap", match[1], match[2], match[3]);
  if (
    url.hostname === "geoservices.wallonie.be" &&
    url.pathname === "/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer" &&
    param("REQUEST") === "GetMap"
  ) {
    const at = wmsTile(url);
    return at && { ...at, source: "wallonia", baseMap: baseMapOf.wallonia };
  }
  if (url.hostname === "geo.api.vlaanderen.be" && url.pathname === "/OMWRGBMRVL/wmts" && param("REQUEST") === "GetTile")
    return tile("flanders", param("TILEMATRIX") ?? "", param("TILECOL") ?? "", param("TILEROW") ?? "");
  if (
    url.hostname === "geoservices-urbis.irisnet.be" &&
    (match = decodeURIComponent(url.pathname).match(
      /^\/geowebcache\/service\/wmts\/rest\/Ortho\/default\/EPSG:900913\/EPSG:900913:(\d+)\/(\d+)\/(\d+)$/,
    ))
  )
    return tile("brussels", match[1], match[3], match[2]);
  if (
    url.hostname === "cartoweb.wmts.ngi.be" &&
    (match = url.pathname.match(/^\/1\.0\.0\/topo\/default\/3857\/(\d+)\/(\d+)\/(\d+)\.png$/))
  )
    return tile("ngi", match[1], match[3], match[2]);
  return null;
}

/** How the stand-in BRouter server answers one request. */
export type BRouterReply = { status: number; body: string };

/** Reads a recorded BRouter response from `src/routing/fixtures`. */
export const brouterFixture = (name: string) => readFileSync(path.join(BROUTER_FIXTURES, name), "utf8");

export type OfflineOptions = {
  /**
   * Answers BRouter requests. Defaults to "service unavailable" (503), so
   * tests that don't care about routing see legs left as straight lines.
   */
  brouter?: (url: URL) => BRouterReply | Promise<BRouterReply>;
  /**
   * Answers the SPW's KiWIS hydrometry service (live Walloon flows, #61).
   * Defaults to "service unavailable" (503): flow-dependent stretches show
   * unknown for today. Replay `src/hydrometry/fixtures` with `kiwisFixtures`.
   */
  kiwis?: (url: URL) => BRouterReply | Promise<BRouterReply>;
  /**
   * Answers Nominatim: reverse geocoding (default names of access points,
   * #136) and search (place search, #172). Defaults to "service unavailable"
   * (503): points stay unnamed and searches fail. Replay `src/geocoding/fixtures`
   * with `nominatimFixture` (one answer for every request) or
   * `nominatimFixtures` (one per path).
   */
  nominatim?: (url: URL) => BRouterReply | Promise<BRouterReply>;
};

const GEOCODING_FIXTURES = path.join(__dirname, "../../src/geocoding/fixtures");

/** Answers every Nominatim request with a recorded Nominatim response from `src/geocoding/fixtures`. */
export const nominatimFixture = (name: string) => {
  const body = readFileSync(path.join(GEOCODING_FIXTURES, name), "utf8");
  return (): BRouterReply => ({ status: 200, body });
};

/** Answers `/reverse` and `/search` each with their own recorded response; a path left out is a 503. */
export function nominatimFixtures(files: { reverse?: string; search?: string }): (url: URL) => BRouterReply {
  const byPath: Record<string, string | undefined> = { "/reverse": files.reverse, "/search": files.search };
  return (url) => {
    const file = byPath[url.pathname];
    return file ? nominatimFixture(file)() : { status: 503, body: "" };
  };
}

const HYDROMETRY_FIXTURES = path.join(__dirname, "../../src/hydrometry/fixtures");

/** Reads a recorded KiWIS response from `src/hydrometry/fixtures`. */
export const kiwisFixture = (name: string) => readFileSync(path.join(HYDROMETRY_FIXTURES, name), "utf8");

/** Replays a recorded series list and values: the two requests the app makes. */
export function kiwisFixtures(list: string, values: string): (url: URL) => BRouterReply {
  return (url) => {
    const request = url.searchParams.get("request");
    if (request === "getTimeseriesList") return { status: 200, body: kiwisFixture(list) };
    if (request === "getTimeseriesValues") return { status: 200, body: kiwisFixture(values) };
    return { status: 400, body: "" };
  };
}

/**
 * Holds every KiWIS answer back until `release()` is called, then gives the
 * wrapped answer. Lets a test observe the page while the flows are loading (#85).
 */
export function delayedKiwis(answer: (url: URL) => BRouterReply | Promise<BRouterReply>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return {
    kiwis: async (url: URL) => {
      await gate;
      return answer(url);
    },
    release,
  };
}

/**
 * Serves every base map's tiles (OpenTopoMap, the Walloon WMS, the Flemish and Brussels WMTS,
 * the NGI's CartoWeb.be; ADR 0031) from one fixture, answers BRouter, KiWIS and Nominatim from recorded
 * responses, and blocks every other external request, so e2e tests never
 * touch live services (ADR 0019).
 * Returns the tiles (with the base map each was for), BRouter routes, KiWIS and Nominatim requests the page asked for, and any other
 * external requests it tried.
 */
export async function serveOffline(page: Page, options: OfflineOptions = {}) {
  const tiles: TileRequest[] = [];
  const brouter: URL[] = [];
  const kiwis: URL[] = [];
  const nominatim: URL[] = [];
  const blocked: string[] = [];
  const answerBRouter = options.brouter ?? (() => ({ status: 503, body: "" }));
  const answerKiwis = options.kiwis ?? (() => ({ status: 503, body: "" }));
  const answerNominatim = options.nominatim ?? (() => ({ status: 503, body: "" }));

  await page.route(
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    async (route) => {
      const url = new URL(route.request().url());
      const tile = tileRequest(url);
      if (tile) {
        tiles.push(tile);
        await route.fulfill({ status: 200, contentType: "image/png", body: TILE_FIXTURE });
      } else if (url.hostname === "brouter.de" && url.pathname === "/brouter") {
        brouter.push(url);
        const reply = await answerBRouter(url);
        await route.fulfill({
          status: reply.status,
          headers: { "Access-Control-Allow-Origin": "*" },
          contentType: reply.status === 200 ? "application/vnd.geo+json" : "text/plain",
          body: reply.body,
        });
      } else if (url.hostname === "hydrometrie.wallonie.be" && url.pathname === "/services/KiWIS/KiWIS") {
        kiwis.push(url);
        const reply = await answerKiwis(url);
        await route.fulfill({
          status: reply.status,
          headers: { "Access-Control-Allow-Origin": "*" },
          contentType: reply.status === 200 ? "application/json;charset=UTF-8" : "text/plain",
          body: reply.body,
        });
      } else if (url.hostname === "nominatim.openstreetmap.org" && ["/reverse", "/search"].includes(url.pathname)) {
        nominatim.push(url);
        const reply = await answerNominatim(url);
        await route.fulfill({
          status: reply.status,
          headers: { "Access-Control-Allow-Origin": "*" },
          contentType: reply.status === 200 ? "application/json; charset=utf-8" : "text/plain",
          body: reply.body,
        });
      } else {
        blocked.push(url.href);
        await route.abort();
      }
    },
  );

  return { tiles, brouter, kiwis, nominatim, blocked };
}
