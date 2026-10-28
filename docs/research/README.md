# Research

Background research for packraft-go: facts about the outside world that shape product decisions. These are **not** decisions. Decisions live in [`../adr/`](../adr/).

Each document records when it was researched and links a source for every claim. **[UNVERIFIED]** marks anything that couldn't be confirmed. Laws, websites and datasets change, so re-check before building on a claim.

| Document | What it covers |
|---|---|
| [access-rules.md](access-rules.md) | Where and when you may paddle in Flanders and Wallonia, and how packrafts are classified |
| [flanders.md](flanders.md) | Detailed Flemish findings: non-navigable rivers allowed by default, VMM agreements, port regulations, the APR |
| [brussels.md](brussels.md) | Brussels-Capital Region: canal and port (allowed, with caveats), the Senne, small streams, ponds, managers and open data |
| [walloon-stretches.md](walloon-stretches.md) | Walloon AGW Annex 1, the whitelist of open stretches (22 entries), with [JSON data](data/walloon-stretches.json) |
| [paddle-routes.md](paddle-routes.md) | Official paddle route sets and legal stretches in Belgium |
| [hydrometry.md](hydrometry.md) | Walloon live river flows (KiWIS API), the licence, and the AGW Annex 2 gauge and threshold table: can the app compute "open today?" |
| [data-sources.md](data-sources.md) | Which access, route and waterway data is machine-readable, and under what licence |
| [map-layers.md](map-layers.md) | Other map base layers (Belgian aerial imagery, NGI topo, hillshade, overlays, keyed providers): terms, Web Mercator support and Leaflet integration (researched 2026-10-28) |

Researched 2026-10-12, from sources the user supplied (Sport Vlaanderen, Peddelsport Vlaanderen, kayak.spw.wallonie.be) and the official sources they lead to.

The stretch geometry shipped with the app is built from `data/walloon-stretches.json`, OpenStreetMap and Cedric's review decisions (`data/walloon-stretches-review.json`). How to re-run the script and the review page: see "Walloon stretch geometry" in the repo's `CLAUDE.md`.
