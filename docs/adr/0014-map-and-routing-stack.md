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
