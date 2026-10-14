import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const TILE_FIXTURE = readFileSync(path.join(__dirname, "../fixtures/tile.png"));
const BROUTER_FIXTURES = path.join(__dirname, "../../src/routing/fixtures");

export type TileRequest = { z: number; x: number; y: number };

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
};

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
 * Serves OpenTopoMap tiles from a fixture, answers BRouter and KiWIS from recorded
 * responses, and blocks every other external request, so e2e tests never
 * touch live services (ADR 0019).
 * Returns the tiles, BRouter routes and KiWIS requests the page asked for, and any other
 * external requests it tried.
 */
export async function serveOffline(page: Page, options: OfflineOptions = {}) {
  const tiles: TileRequest[] = [];
  const brouter: URL[] = [];
  const kiwis: URL[] = [];
  const blocked: string[] = [];
  const answerBRouter = options.brouter ?? (() => ({ status: 503, body: "" }));
  const answerKiwis = options.kiwis ?? (() => ({ status: 503, body: "" }));

  await page.route(
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    async (route) => {
      const url = new URL(route.request().url());
      const tile = url.hostname.endsWith("tile.opentopomap.org")
        ? url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/)
        : null;
      if (tile) {
        tiles.push({ z: Number(tile[1]), x: Number(tile[2]), y: Number(tile[3]) });
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
      } else {
        blocked.push(url.href);
        await route.abort();
      }
    },
  );

  return { tiles, brouter, kiwis, blocked };
}
