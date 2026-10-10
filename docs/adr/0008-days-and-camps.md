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
