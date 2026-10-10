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
