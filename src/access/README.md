# Built-in access data

The access rule data shipped with packraft-go (ADR 0024, issue #53). The app reads it; it never queries OpenStreetMap at runtime.

- `data/*.json`: generated datasets, format `packraft-go/access-data`, version 1. Every record has a rule, a source and a research date; `data.test.ts` checks this and that known waters land where they should.
  - `regions.json`: Flanders, Wallonia and the Brussels-Capital Region, each with its default rule.
  - `flanders.json`: the Flemish exceptions (forbidden canals, the Lower Sea Scheldt, the Reien, the Afleiding van de Nete, the ports of Antwerp, Ghent and Zeebrugge) and the VMM agreement stretches (open, with text rules and a link).
  - `brussels.json`: the Brussels canal (open, with notes on commercial priority, VHF and the Capitainerie), the ponds (forbidden without permission), the Senne and the small streams (unknown). From `docs/research/brussels.md`.
  - `locks.json`: lock markers for Flanders and Brussels (format `packraft-go/lock-data`, version 1): a position per lock, with the region's portage rule source and research date. The map draws them with the access layer from zoom 11 on (`lockMarkersMinZoom`); the detail panel says "portage required".
- `walloon.ts` (#59): turns the reviewed Walloon stretches (`src/data/walloon-stretches.json`, #54) into `agw` rule records when `builtInRules.ts` loads; the file is not copied. The core (`src/core/agw.ts`) works out season, fishing opening days and hours from the category and the date. Assumed gauges keep their flag in the rule for #61. Water in Wallonia that is not a listed stretch gets the region's rule: unknown, treated as not allowed, never painted.
- Live flows (#61) are not built-in data: `src/hydrometry/kiwis.ts` asks the SPW's KiWIS service for today's readings of the Annex 2 gauges (two batched requests, cached 15 minutes), and the core (`src/core/flow.ts`) applies AGW art. 6 on today's date only. Recorded responses for tests are in `src/hydrometry/fixtures/`.
- `builtInRules.ts`: loads the datasets as the core's `AccessRules`. The map imports it lazily, the first time the access layer is switched on.
- `prepare/`: the offline preparation. `sources.ts` holds the rules (from `docs/research/`) and which OpenStreetMap objects make up each water; `osm.ts` and `build.ts` turn Overpass answers into simplified, rounded geometry.

## Regenerating

```
npm run prepare:access-data            # reuses cached Overpass answers
npm run prepare:access-data -- --fresh # asks Overpass again
npm run prepare:access-data -- --skip-flanders # refreshes regions, Brussels and locks; keeps flanders.json
```

Manual only: never part of `npm test`, `npm run e2e` or CI. It sends one request at a time with a pause between requests, identifies itself with the project URL only (never a personal email), and caches answers in `.cache/access-osm/` (git-ignored). Review the diff of `data/` before committing.

## Licence and credit

All geometry is derived from OpenStreetMap, © OpenStreetMap contributors, under the ODbL. The map credits it while the access layer is on, and so does the detail panel. No other dataset is used: the VHA and RIS-index services were not needed.

Port areas are approximated by the docks mapped in OpenStreetMap (inside a hand-drawn envelope, or inside OSM's Ghent port area); the records say so in `unverified`.
