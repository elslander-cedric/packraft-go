# 14. Leaflet + OpenTopoMap + BRouter

Date: 2026-10-10

## Status
Accepted

## Context
We need an interactive map, a topo base layer, and snapping of hike legs to trails and paddle legs to rivers, all free with no keys (ADR 0012). Research found the public BRouter server allows browser calls, has hiking and river profiles, and returns per-point elevation.

## Decision
Map: Leaflet. Base tiles: OpenTopoMap. Snapping + distance + elevation: public BRouter server (hiking profile for hike legs, river profile for paddle legs). A leg is routed only when it changes, and the result is stored in the trip. Fallback for problem rivers: Overpass API waterway geometry snapped client-side with Turf.js.

## Consequences
- Attribution for OSM/OpenTopoMap/BRouter must be visible.
- BRouter's river profile is a proof of concept and ignores weirs (see ADR 0016).

## Amendment (2026-10-11, PR #16)
- **Profile name:** hike legs use BRouter's `hiking-mountain` profile. The public server has no profile called `hiking` (requesting it returns HTTP 500), and `hiking-mountain` is its walking profile.
- **Climb and descent:** hike-leg climb is BRouter's own smoothed figure (`filtered ascend`), not the raw sum of per-point elevation changes, which over-counts noise in the elevation data (118 m raw against 100 m filtered on a recorded 3.2 km track). BRouter does not report a descent, so descent (and climb, if a result lacks BRouter's figure) uses the same kind of smoothing: elevation changes accumulate in a 5 m buffer, and only the part of a sustained rise or fall beyond the first 5 m counts. A 5 m buffer reproduces BRouter's climb on recorded tracks (99.25 m against its 100 m).
