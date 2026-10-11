# 18. Paddle legs show drop

Date: 2026-10-10

## Status
Accepted

## Context
Climb/descent is meaningless on water, but elevation lost over distance hints at river gradient.

## Decision
Paddle legs show drop (put-in elevation minus take-out elevation). Hike legs show climb and descent.

## Consequences
- Computed from per-point elevations, not BRouter's ascend figure.

## Amendment (2026-10-11, PR #17)
- **Small rises are noise:** rivers flow downhill, so a paddle leg whose take-out is higher than its put-in comes from elevation data noise or a leg drawn the wrong way. If the take-out is at most 2 m higher, the drop is shown as 0 m.
- **Larger rises are a hint:** if the take-out is more than 2 m higher, the leg shows a rise with a hint instead of a negative drop, e.g. "↑ 3 m (upstream?)", so the planner can check the leg's direction.
