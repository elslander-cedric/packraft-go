# Built-in access data

The access rule data shipped with packraft-go (ADR 0024, issue #53). The app reads it; it never queries OpenStreetMap at runtime.

- `data/*.json`: generated datasets, format `packraft-go/access-data`, version 1. Every record has a rule, a source and a research date; `data.test.ts` checks this and that known waters land where they should.
  - `regions.json`: Flanders, Wallonia and the Brussels-Capital Region, each with its default rule.
  - `flanders.json`: the Flemish exceptions (forbidden canals, the Lower Sea Scheldt, the Reien, the Afleiding van de Nete, the ports of Antwerp, Ghent and Zeebrugge) and the VMM agreement stretches (open, with text rules and a link).
  - `brussels.json`: the Brussels canal (open, with notes on commercial priority, VHF and the Capitainerie), the ponds (forbidden without permission), the Senne and the small streams (unknown). From `docs/research/brussels.md`.
  - `locks.json`: lock markers for Flanders and Brussels (format `packraft-go/lock-data`, version 1): a position per lock, with the region's portage rule source and research date. The map draws them with the access layer from zoom 11 on (`lockMarkersMinZoom`); the detail panel says "portage required".
- `walloon.ts` (#59): turns the reviewed Walloon stretches (`src/data/walloon-stretches.json`, #54) into `agw` rule records when `builtInRules.ts` loads; the file is not copied. The core (`src/core/agw.ts`) works out season, fishing opening days and hours from the category and the date. Assumed gauges keep their flag in the rule for #61. Each rule carries its `officialStretch` when it has one (#209, ADR 0035); four Annex rows are split at an official boundary, so there are 32 records from 28 rows. Records aren't saved in trips, so this needs no save format change. Water in Wallonia that is not a listed stretch gets the region's rule: forbidden, which reads "not allowed" (#75), never painted.
- Live flows (#61) are not built-in data: `src/hydrometry/kiwis.ts` asks the SPW's KiWIS service for today's readings of the Annex 2 gauges, and Hérock for the Lesse from Han to Houyet (two batched requests with a timeout, answers and failures cached 15 minutes), and the core (`src/core/flow.ts`) applies AGW art. 6 on today's date only. Recorded responses for tests are in `src/hydrometry/fixtures/`.
- `data/official-aires.json` and `data/official-stretches.json` (ADR 0035, #206): the SPW's 92 official aires (formats `packraft-go/official-aire-data` and `packraft-go/official-stretch-data`, version 1) and each official stretch's id and name, each file with its source and snapshot date. One item per line, so a refresh reads well as a diff. Stretch lines aren't shipped. SPW type `E` is a put-in, `D` a take-out, `ED` both, and `NA` is treated as both; any other code stops the script.
- `builtInRules.ts`: loads the datasets as the core's `AccessRules`. The map imports it lazily, the first time the access layer is switched on.
- `prepare/`: the offline preparation. `sources.ts` holds the rules (from `docs/research/`) and which OpenStreetMap objects make up each water; `osm.ts` and `build.ts` turn Overpass answers into simplified, rounded geometry.

## The access layer

ADRs 0022, 0024. Built-in rule data with a source and research date per record, prepared offline with `npm run prepare:access-data` (never queried at runtime), and the pure access-status evaluation in the core: `src/core/access.ts`, with the Walloon AGW rules in `src/core/agw.ts`. `walloon.ts` adapts `src/data/walloon-stretches.json` at load time.

## Official aires

ADR 0035, #206.

- `OfficialAire` and `OfficialStretch` are in `src/core/officialAire.ts`: a read-only type of their own, not an `AccessPoint`, never written to access point storage, trips or settings.
- Built-in snapshots `data/official-aires.json` and `data/official-stretches.json` (ids and names only; no lines shipped), prepared offline by `scripts/prepare-spw-data.mts` with the pure, tested logic in `prepare/spw.ts`; never queried at runtime.
- `builtInOfficialAires.ts` (apart from the rules so the planner can load them from a trip's first point) adds each aire's id and the snapshot's source and date on load.
- Warnings and snap offers (#207): `aireWarnings` and `snapCandidate` take them beside your access points. A built-in aire must fit the put-in or take-out; your official-aire marks count whatever their use. A `SnapOffer`'s target is either kind. Accepting one moves the trip point only.
- `src/map/OfficialAireLayer.tsx` draws them with the access layer in the locks' pane: every aire at any zoom, small and not tappable below `aireFullMarkersMinZoom`, a 44 px target from it.
- A tap opens `OfficialAireDetail` in `AccessDetailsDialog`, which shows the access status of the aire's stretch on the access layer's date (`officialStretchAccess` in the core, #213: every record on the stretch, the most restrictive wins), worded by `statusReasonTexts` in `src/ui/reasonText.ts`.
- `useAccessLayer` loads the rules, flows and official status while an aire is open, also with the layer off.

## Obstacles

ADR 0035, #214.

- `Obstacle` and `obstacleKinds` are in `src/core/obstacle.ts`.
- Built-in snapshot `data/obstacles.json`, prepared by the same script from layer 1. The kind comes from `codico` alone (the script fails on any other code), and the name and meaning are the app's own in `strings.obstacles`, as the SPW publishes only a position.
- `builtInObstacles` adds each one's id and the snapshot's source and date on load.
- `src/map/ObstacleLayer.tsx` draws them with the access layer in the locks' pane from `lockMarkersMinZoom`, small and not tappable below `obstacleFullMarkersMinZoom`, a 44 px target from it, each kind with its icon from `obstacleIcons`.
- A tap opens `ObstacleDetail` in `AccessDetailsDialog`.
- Warnings (#215): `tripAccess` gives a paddle leg an `obstacleWarnings` entry per obstacle within `LOCK_TOLERANCE_M` of its line, in the order it meets them (`obstaclesOnLine`), beside `lockWarnings` on legs, days and sections. Never by date or flow, and never blocking. `dayWarnings` counts them as the `obstacle` kind.
- A leg's details show one line per kind (`obstacleGroups`), so a long stretch stays readable.

## Regenerating

```
npm run prepare:access-data            # reuses cached Overpass answers
npm run prepare:access-data -- --fresh # asks Overpass again
npm run prepare:access-data -- --skip-flanders # refreshes regions, Brussels and locks; keeps flanders.json
```

Manual only: never part of `npm test`, `npm run e2e` or CI. It sends one request at a time with a pause between requests, identifies itself with the project URL only (never a personal email), and caches answers in `.cache/access-osm/` (git-ignored). Review the diff of `data/` before committing.

```
npm run prepare:spw-data   # the official aires, stretches and obstacles, from the SPW's PKAYAK service
```

Manual only, like the above; see `docs/manual-scripts.md`. It writes nothing unless every layer passes its checks. Review the diff of `data/` before committing.

## Licence and credit

All water and lock geometry is derived from OpenStreetMap, © OpenStreetMap contributors, under the ODbL. The map credits it while the access layer is on, and so does the detail panel. Apart from the SPW's data below, no other dataset is used: the VHA and RIS-index services were not needed.

The official aires and stretches are the SPW's, shipped with its permission (ADR 0035). Credit: "Sources des données : Service public de Wallonie", shown in the map's attribution while the access layer is on and in each aire's details.

Port areas are approximated by the docks mapped in OpenStreetMap (inside a hand-drawn envelope, or inside OSM's Ghent port area); the records say so in `unverified`.
