# 8. Trips are split into days by camps

Date: 2026-10-10

## Status
Accepted

## Context
Trips may be a single day or several days. Multi-day planners need to know how much they're doing each day.

## Decision
The user can mark camps on the route. Camps split the trip into days; each day shows its own totals (distance per mode, elevation, time) alongside trip totals. A trip without camps is a one-day trip.

## Consequences
- Day totals are derived from legs, never stored separately.
- A camp may sit at a put-in/take-out or in the middle of a leg.

## Amendment (2026-10-11, #8)
How camps and days work in v1:
- **A camp is a point.** Any point can be marked or unmarked as a camp (an undoable edit). To camp partway along a leg, add a point there. So a day boundary always falls between legs.
- **Camps at the start or end point split nothing.** A camp there may be marked (e.g. a night before or after the trip), but it adds no empty day. n camps between the start and the end make n + 1 days.
- **Day totals:** hike distance, paddle distance, climb and descent (hike legs only; paddle legs have a drop instead, ADR 0018), and estimated time. The day time follows the same rule as the trip total (ADR 0009): "…" while any of its legs is being snapped, "(no climb data)" when it includes a hike leg that failed to route.
- **Marking a camp changes no leg**, so no leg is snapped again.
- **Saving:** camps are saved as a `camps` list of point indices in save format version 2 (ADR 0011, amended). Version 2 is the only version the app opens (#33).
