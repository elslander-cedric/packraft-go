# TODO

Improvements for packraft-go, beyond v2. GitHub issues are the source of truth for work in progress. This file lists everything worth doing, so ideas don't get lost in chat.

- **Filed** items link to their issue. Close the issue, then remove the line here.
- **Unfiled** items become issues when they're picked (spec → tickets).

## Candidates (not filed)

v2 (spec #51) shipped river access rules, the Walloon aires warning, access points on desktop and phone, the PWA and phone layout, and live Walloon flows.

### Deferred by an ADR
- [ ] **River information**: difficulty grade, water levels, hazards. Data is patchy for Belgian rivers, so research sources first. ADR 0007
- [ ] **Weirs and portages**: detect weirs on paddle legs automatically instead of drawing portages by hand. ADR 0016
- [ ] **Official paddle routes as suggestions/overlays**: only if the licence allows. Research: [paddle routes](docs/research/paddle-routes.md)

### Left out of v1, could come later
- [ ] **Live Flemish water levels** (waterinfo.be) for VMM agreement stretches such as the Kleine Nete (min 50 cm at Retie). ADR 0024
- [ ] **Community / shared access points** (needs a backend). ADR 0023
- [ ] **Automatic route-finding**: suggest the hike/paddle mix between a start and an end. ADR 0003
- [ ] **Overpass + Turf.js fallback** for paddle legs, if BRouter's experimental river profile fails on real rivers. ADR 0014
- [ ] **Whole-trip GPX export** as one file (one track), next to the per-section ZIP, for apps that handle long courses. ADR 0021
- [ ] **GPX import**: bring in tracks from other apps. Spec #2, Out of scope
- [ ] **More editing**: redo, notes on points/legs, alternative routes per trip. ADR 0017
- [ ] **Several trips in the browser**: a trip list instead of one current trip (today, files are the way to keep more than one). Spec #2, Out of scope
- [ ] **Offline maps in the field**: the phone layout, GPS position and marking access points shipped in v2 (ADR 0023); map tiles are still online only. ADR 0001, ADR 0005
- [ ] **Lock data for Wallonia**: locks come from #57 and cover Flanders and Brussels only, so a Walloon leg never gets a lock warning. Cedric decided against a coverage note for now (2026-10-14).
- [ ] **Accounts and sync between devices**: needs a backend and costs money. ADR 0002, ADR 0011, ADR 0012
- [ ] **Other regions** beyond Belgium: mostly config (initial map view). ADR 0004
- [ ] **Dutch and French UI**: strings are already in one module. ADR 0013

## Small notes from v1 testing (not filed)

Low priority. File one if it starts to bother you.

- [ ] Trip total time can differ by a minute from the sum of the rounded leg times (totals use exact values).
- [ ] While a paddle leg is pending, its row shows a time but the trip total shows "…".
- [ ] A failed hike leg adds 0 m to its day's climb; only the time carries the "(no climb data)" marker.
- [ ] Unknown or non-numeric save-file versions show "damaged file" rather than "unknown version".
- [ ] Hike descent uses a 5 m threshold filter tuned on one recorded track (BRouter only gives smoothed climb). Check it against more tracks.
- [ ] Characters not allowed in XML are silently dropped from names in GPX exports.
- [ ] `npm audit`: high-severity issues in a dev-only lint dependency (`eslint-config-next` → `braces`). Re-check when Next.js updates.
- [ ] GitHub commits show the author's personal email; switch future commits to GitHub's noreply address if wanted.

- [ ] On short screens (800 px tall), the trip totals sit below the visible legs panel; consider collapsing Settings. (from #27)
- [ ] Day rows: "Descent" wraps to its own line; restore the tidy 2×2 figure grid. (from #27)
- [ ] GPX: "Day 1" appears in section file names when the only camp is on the start or end point (no second day exists). (from #41)
- [ ] GPX: where a routed leg meets an unrouted leg inside one section, the dropped join point can cause a small jump. (from #41)

## Small notes from v2 (not filed)

Low priority. File one if it starts to bother you.

- [ ] Monthly reminder to run `npm run check:brouter` and `npm run check:kiwis` (manual, polite live checks).
- [ ] `e2e/acceptance-10.spec.ts:103` and `e2e/acceptance-9.spec.ts:109` snapshot `panel.innerText()`; like #80 and #84 they could race with access text that renders late.
- [ ] Occasional load flakes: `acceptance-44`, and the `acceptance-5` portage test.
- [ ] Unused `fam` lint warning in `e2e/acceptance-70-fonts.spec.ts`.
- [ ] `TripAccessSummary` ignores lock warnings when deciding to hide itself (harmless today: a leg with a lock always has a state).
- [ ] Live flows: a failed KiWIS request is cached for 15 minutes (a reload clears it). (from #61)
- [ ] Lock detection: 100 m from the leg, same-name chambers within 400 m count once; check against real trips. A failed (straight) leg can cross or miss a lock. (from #60)

## Process
- [ ] Plan a real trip with v2 and note what's missing.
- [x] Research access rules, routes and data sources for Flanders and Wallonia: see [docs/research/](docs/research/).
- [x] Check the Walloon hydrometry API: it works from the browser; publishing needs SPW permission. See [hydrometry.md](docs/research/hydrometry.md).
- [ ] Email the SPW for written permission to show flows and a derived status, and ask which gauge is used for Wanlin (Cedric sends).
- [x] Extract AGW Annex 1 ([walloon-stretches.md](docs/research/walloon-stretches.md)) and check the Flemish rules and ports ([flanders.md](docs/research/flanders.md)).
- [x] Place the Walloon stretch start and end points on the map (#54, reviewed 2026-10-13).
- [ ] Close spec #51 (all sub-issues are done).
- [ ] Still open: Boudewijnkanaal status; whether any Flemish river managers have imposed bans.
