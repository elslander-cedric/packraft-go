# Map

The Leaflet map with OpenTopoMap tiles. Map components must be client-only (Leaflet needs `window`).

- `TripMap.tsx` imports Leaflet and must only be loaded through `ClientTripMap.tsx` (no server rendering).
- `TripMap.tsx` only assembles the map. Its parts, one concern per file:
  - `MapCamera.tsx`: where the map looks (the fit when it opens, centring on your position, a place the planner asks to show).
  - `Taps.tsx`: turns clicks into map taps and leg taps, ignoring double taps, pinches and holds.
  - `TripLayers.tsx`: draws the trip (legs, points, camps, put-ins and take-outs) and their hit areas.
- Base maps (ADR 0031, #179): `mapConfig.ts` holds the initial view and the base maps: OpenTopoMap (default), Aerial photos (Belgium) and NGI topo (Belgium), each a stack of tile sources with OpenTopoMap underneath the Belgian ones. `BaseMapTiles.tsx` draws the chosen one and caps the zoom at its max. The choice is `baseMap` in the planner's settings, never in the trip.
- Overlays (ADR 0032, #180): `overlays` in `mapConfig.ts`, for now only Hiking trails (Waymarked Trails, native tiles to z18), drawn by `OverlayTiles.tsx` in their own pane (`paneZIndex.overlays`) above the base map and below the access layer and the trip. The switched-on ones are `overlays` (a list of `overlayIds`) in the settings.
- Legs: drawn in their own pane (`paneZIndex.tripLegs`) above the access layer's waters, each on a white casing (`leg-casing`, ADR 0033). Their colours and the camp icon are in `tripStyles.ts`.
- Point numbers (prototype/point-numbers): route points show their number (the point card's) on a badge: every point from `pointNumbersMinZoom`, further out only the first, last and selected (`isPointNumbered` in `pointNumbers.ts`). The badge is the point's own `path.point`, made larger; the number is a non-interactive `.point-number` marker in its own pane (`paneZIndex.tripPointNumbers`), so count route points by `path.point`, not marker icons.
- Suggested trips (ADR 0039): `SuggestedTripLayer.tsx` draws them as purple `path.suggested-trip` lines on white casings with `.suggested-trip-number` badges, in their own pane (`paneZIndex.suggestedTrips`) below the trip's legs. Each line has an unseen 28 px hit line (`path.suggested-trip-hit`, `data-suggestion`), which `Taps.tsx` turns into a suggestion tap. With one `selected`, its lines get `suggested-trip-selected` and are drawn on top, the others `suggested-trip-faded`.
- The Map menu (`strings.mapMenuButton`) opens from the layers button (`src/ui/planner/MapMenu.tsx`): the base maps, then the access layer and overlay switches.

## Tests

- `serveOffline` serves every base map and overlay source's tiles from the fixture and records each tile's `source` and `baseMap` (null for an overlay).
- In e2e use the helpers in `e2e/support/mapMenu.ts`.
- `npm run check:basemaps` (manual only) asks every base map and overlay source for one tile.
