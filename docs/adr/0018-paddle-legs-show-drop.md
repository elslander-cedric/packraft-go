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
