# 9. Time estimation: Naismith for hiking, user speed for paddling

Date: 2026-10-10

## Status
Accepted

## Context
Hiking time depends mostly on distance and climb; paddling time depends on current and water level, which we can't reliably know.

## Decision
Hike legs use Naismith's rule (5 km/h on flat + 1 h per 600 m ascent), scaled by a user pace factor. Paddle legs use a user-set average speed (default 5 km/h). Both are adjustable in settings.

## Consequences
- Estimates are explicitly labelled as estimates.

## Amendment (2026-10-11, PR #20)
Hike time needs climb, which only a routed hike leg has:
- **While a hike leg is being snapped** (pending), its time shows "…". The trip total also shows "…" while any leg, hike or paddle, is pending.
- **If a hike leg failed to route**, its time counts the straight-line distance only and is marked "(no climb data)", e.g. "24 min (no climb data)". The trip total includes it and carries the same marker.
- **Paddle legs are unchanged:** their time does not depend on climb, so it is always distance ÷ paddling speed.
