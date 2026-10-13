# 24. Access data: built-in rule data plus live Walloon flows

Date: 2026-10-12

## Status
Accepted. Supersedes ADR 0010 (no legal checks in v1).

## Context
v2 shows access status on the map (ADR 0022). Rules are known from the research in `docs/research/`. Stretch geometry has to be derived from OpenStreetMap, because the official Walloon geometry is restricted. Live Walloon flows are available from a public KiWIS service that allows browser calls, and the SPW has no objection to showing them. Some gauges are ambiguous, and the legal 08:00 flow forecast isn't public.

## Decision
- **Rule data ships with the app** as static files in the repo:
  - the Walloon stretches (AGW Annex 1 + 2) with line geometry
  - the Flemish exceptions and ports
  - the Brussels zones
  - locks

  Geometry is prepared ahead of time from OpenStreetMap. It's never queried at runtime. The data is ODbL-derived and credited to OpenStreetMap.
- **Walloon stretch ends** are proposed by an agent: confluences and borders computed, dams and bridges looked up in OSM. Each point is marked confident or needs review, and Cedric reviews the uncertain ones.
- **Live flows:** the browser calls the KiWIS service directly, at most two batched requests per visit, cached for 15 minutes. If the service fails or the data is stale, flow-dependent stretches show **unknown** with a link to kayak.spw.wallonie.be. The data is credited "Sources des données : Service public de Wallonie".
- **The 08:00 forecast rule is approximated** by the flow measured at 08:00 and labelled "based on measured flow; the official status may differ".
- **Gauges:**
  - Wanlin (Lesse) has no matching gauge, so its flow status is unknown. Season and hours are still checked.
  - Martelange, Membre, Martinrive and Gendron use the most likely gauge, marked as assumed in the data and shown as assumed in the app. Martinrive and Gendron were added on 2026-10-13: their match to Annex 2 is also unconfirmed.
- **A packraft is treated as a kayak** under the Walloon AGW. "Kayaks only" counts as open, and the rule for 4–10 person inflatables doesn't apply. This is our reading of the law, not an official statement.
- **Flemish agreement stretches** (VMM): rules are shown as text (hours, water-level limits, a link). No live Flemish levels in v2.
- **Opening hours** are shown on paddle legs as information, not checked.
- **Locks:** a paddle leg that passes a lock gets a "portage required" warning.
- **Disclaimer stays:** "Indicative only; you're responsible for checking local rules."

## Consequences
- The rule data must be kept current by hand. Each dataset records its source and research date.
- Tests use recorded KiWIS responses, never the live service (in line with ADR 0019). A manual contract check like `check:brouter` is advisable.
- Live Flemish water levels (waterinfo.be) are a later candidate.
