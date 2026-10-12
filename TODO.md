# TODO

Improvements for packraft-go, beyond v1. GitHub issues are the source of truth for work in progress. This file lists everything worth doing, so ideas don't get lost in chat.

- **Filed** items link to their issue. Close the issue, then remove the line here.
- **Unfiled** items become issues when they're picked (spec → tickets).

## v1.1: polish (filed)

- [ ] Use Base UI for interface components: in-app confirm dialogs, hike/paddle toggle group, number fields, toolbar with tooltips. ADR 0020. [#31](https://github.com/elslander-cedric/packraft-go/issues/31)
- [ ] Give leg rows in the sidebar more room. Blocked by #31. [#27](https://github.com/elslander-cedric/packraft-go/issues/27)
- [ ] Make the hard-coded-text check accurate: it flags generics and arrow functions as text. [#26](https://github.com/elslander-cedric/packraft-go/issues/26)
- [ ] Warn instead of discarding an autosave from a newer version (matters now that the app is live). [#28](https://github.com/elslander-cedric/packraft-go/issues/28)
- [ ] Manual script to check the live BRouter server still matches our recorded fixtures. [#29](https://github.com/elslander-cedric/packraft-go/issues/29)

## v2: candidates (not filed)

### Deferred to v2 by an ADR
- [ ] **River information**: difficulty grade, water levels, hazards. Data is patchy for Belgian rivers, so research sources first. ADR 0007
- [ ] **Weirs and portages**: detect weirs on paddle legs automatically instead of drawing portages by hand. ADR 0016
- [ ] **River access rules**: when and where paddling is allowed in Flanders and Wallonia (seasons, hours, flow thresholds, closed stretches, locks). Needed before sharing the app widely. ADR 0010. Research: [access rules](docs/research/access-rules.md), [data sources](docs/research/data-sources.md)
- [ ] **Designated put-ins (aires) in Wallonia**: snap or warn when a mode change isn't at an aire. Research: [paddle routes](docs/research/paddle-routes.md)
- [ ] **Official paddle routes as suggestions/overlays**: only if the licence allows. Research: [paddle routes](docs/research/paddle-routes.md)

### Left out of v1, could come later
- [ ] **Automatic route-finding**: suggest the hike/paddle mix between a start and an end. ADR 0003
- [ ] **Overpass + Turf.js fallback** for paddle legs, if BRouter's experimental river profile fails on real rivers. ADR 0014
- [ ] **GPX import**: bring in tracks from other apps. Spec #2, Out of scope
- [ ] **More editing**: redo, notes on points/legs, alternative routes per trip. ADR 0017
- [ ] **Several trips in the browser**: a trip list instead of one current trip (today, files are the way to keep more than one). Spec #2, Out of scope
- [ ] **Phone layout / use in the field**: offline maps, GPS position. ADR 0001, ADR 0005
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

## Process
- [ ] Before v2: plan a real trip with v1 and note what's missing.
- [x] Research access rules, routes and data sources for Flanders and Wallonia: see [docs/research/](docs/research/).
- [ ] Close the research's open questions: Walloon hydrometry API + licence, AGW Annex 1 & 2, port regulations in Flanders. See [data-sources.md](docs/research/data-sources.md#next-steps-for-v2-planning).
