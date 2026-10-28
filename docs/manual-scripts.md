# Manual scripts

These scripts are manual only: never part of `npm test`, `npm run e2e` or CI. They call free public services, so run them one at a time and never in a loop.

## Live BRouter check

`npm run check:brouter`. Calls the public BRouter server four times, one request at a time with a 2 s pause, identifying itself with the project URL only. It compares each answer with its recorded fixture in `src/routing/fixtures/` and with what the adapter makes of it, then prints MATCH / DRIFT / MISMATCH per check. Exit code 1 means a mismatch: the live app is probably broken. Drift alone passes and means "consider re-recording". Run it now and then (e.g. monthly), or when live routing misbehaves while the tests pass. Don't run it in a loop: it's a free community server. It never writes fixtures; re-recording stays a deliberate, manual step. Logic: `src/routing/liveCheck.ts` (unit-tested offline); entry point: `scripts/check-brouter.mts`.

## Live KiWIS check

`npm run check:kiwis` (#64). Makes two requests to the SPW hydrometry service (the series list, then the values of those series), one at a time with a 2 s pause, no retries, identifying itself with the project URL only. It compares the answers with the recorded fixtures in `src/hydrometry/fixtures/` and with what the KiWIS adapter makes of them: table layout, series names, value columns, and the time offset (timestamps must be Belgian local time with its offset, +01:00 / +02:00, because the 08:00 reading is picked from the text; UTC is a MISMATCH). Prints MATCH / DRIFT / MISMATCH; exit code 1 means a mismatch (live Walloon flows are probably broken). Drift alone passes. Never writes fixtures; re-record by hand only on a mismatch. Logic: `src/hydrometry/liveCheck.ts` (unit-tested offline); entry point: `scripts/check-kiwis.mts`.

## Live base map check

`npm run check:basemaps` (#179, ADR 0031). Asks every base map source for one tile: OpenTopoMap, the Walloon SPW orthophoto WMS, the Flemish orthophoto WMTS, Brussels' UrbIS and the NGI's CartoWeb.be topo. One request at a time with a 1.5 s pause, no retries, identifying itself with the project URL only. Prints OK / FAILED per source (FAILED with the HTTP status, a non-image answer or the network error, and the URL asked for); exit code 1 means a source failed and that base map is probably broken in the live app. Run it now and then, or when a base map shows blank tiles. Logic: `src/map/baseMapCheck.ts` (unit-tested offline); entry point: `scripts/check-basemaps.mts`.

## Walloon stretch geometry

Walloon stretch geometry (#54, ADR 0024):
  1. `npm run data:walloon-stretches` builds the 28 stretches from `docs/research/data/walloon-stretches.json` (Annex 1/2), OSM and the review decisions. OSM comes from Overpass: one query per river plus one for the national border, one request at a time, project URL as User-Agent. Answers are cached in `.cache/osm/` (git-ignored), so re-runs don't re-fetch; delete that folder to refresh from OSM (`--offline` refuses to fetch). If Overpass is busy, re-run: cached answers are kept, or set `OVERPASS_URL` to another public instance. The script writes a draft to `.cache/walloon-stretches.draft.json`, and writes the shipped `src/data/walloon-stretches.json` only when no end point needs review.
  2. `npm run review:walloon-stretches` serves the review page at http://localhost:3461 (`REVIEW_PORT` to change). It shows every stretch; orange end points need review. Confirm a point, or drag it and save the move; each choice is written at once to `docs/research/data/walloon-stretches-review.json` (commit it) and the stretches are rebuilt from the cache. A confirmed point that OSM later moves by more than 30 m needs review again.
  3. Re-run step 1 to write the shipped dataset.
  End-point recipes (which dam, bridge, confluence or border ends each stretch) are in `src/dataprep/walloonStretches/recipes.ts`; logic in `src/dataprep/walloonStretches/` is pure and tested on saved OSM extracts in its `fixtures/` folder (make new ones with `scripts/walloon-stretches/save-fixture.mts`).
