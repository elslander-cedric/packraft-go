# 3. The user draws the route; the app assists

Date: 2026-10-10

## Status
Accepted. Amended by ADR 0039: the app may also propose one-day trips from your trip wishes (suggested trips), which you browse and may use as your trip.

## Context
Automatically finding the best mix of hiking and paddling between two points is a hard routing problem. Manually drawing legs is far simpler and still very useful.

## Decision
The user places points on a map and marks each leg as hike or paddle. The app snaps legs to trails/waterways and computes figures. No automatic route-finding in v1.

## Consequences
- Automatic route suggestions are a possible later feature.
- Snapping quality depends on map data along the chosen line.
