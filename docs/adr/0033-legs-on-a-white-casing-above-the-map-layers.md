# 33. Legs on a white casing, above the map's layers

Date: 2026-10-29

## Status
Accepted

## Context
The trip's legs were hard to pick out from the map's layers. The Hiking trails overlay (ADR 0032) draws waymarked routes in red, orange, purple, blue and yellow: the hike leg's earth red and the paddle leg's blue are among them. The access layer's waters (ADR 0022) run under the paddle legs in green, orange, red and grey. On top of that, the waters were drawn *over* the legs. `AccessLayer` puts its pane (z-index 350) inside Leaflet's overlay pane, and the legs were drawn straight into the overlay pane's own SVG, which has no z-index. So the waters stacked above the legs, against the order ADR 0032 states (access layer < trip).

A throwaway prototype (branch `prototype/layer-colours`, not merged) compared five styles side by side on the desktop and the phone, on a trip along the Ourthe at Barvaux and Durbuy, with both layers on.

## Decision
- **Legs in their own pane** (`paneZIndex.tripLegs`, 360), inside the overlay pane: above the access layer's waters (350), below the put-ins, take-outs and points (400+).
- **A white casing under each leg:** a white line 5 px wider than the leg, on the same path, drawn just before it (`legCasingStyle` in `TripMap.tsx`, class `leg-casing`). It is used on both layouts and never takes clicks. The legs keep their colours and widths (hike earth red 4 px, paddle blue 6 px), and failed or dragged legs stay dashed on a solid casing.
- The overlays and the access layer keep their look.

## Considered options (prototype variants)
- **A, today:** the hike leg disappears into the trails, and the paddle blue reads like a blue trail.
- **B, cased legs (chosen):** the clearest on both layouts, whatever lies under the leg, and the layers stay as they are.
- **C, layers recede** (dotted waters, faded grey trails): the legs stand out, but the trail markings get hard to read.
- **D, highlighter waters** (wide translucent bands under the route): too faint at zoom 14, and a hike leg on a waymarked trail still blends in.
- **E, a new route palette** (magenta hike, cyan paddle with a navy edge): clear, but only thanks to its casing. The trails already use most colours, so new colours alone don't fix it.

## Consequences
- One more SVG path per leg.
- `e2e/leg-casing.spec.ts` checks, on both layouts, that each leg has its casing and that the paddle leg is the topmost path drawn over its water.
- New map layers go below `paneZIndex.tripLegs`.
