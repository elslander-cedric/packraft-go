import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const TILE_FIXTURE = readFileSync(path.join(__dirname, "../fixtures/tile.png"));

export type TileRequest = { z: number; x: number; y: number };

/**
 * Serves OpenTopoMap tiles from a fixture and blocks every other external
 * request, so e2e tests never touch live services (ADR 0019).
 * Returns the tiles the page asked for and any external requests it tried.
 */
export async function serveOffline(page: Page) {
  const tiles: TileRequest[] = [];
  const blocked: string[] = [];

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
      } else {
        blocked.push(url.href);
        await route.abort();
      }
    },
  );

  return { tiles, blocked };
}
