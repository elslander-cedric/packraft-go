# 32. Overlays: hiking trails from Waymarked Trails

Date: 2026-10-28

## Status
Accepted

## Context
ADR 0031 added base maps and left other overlays for later (#180). Hike legs and portages follow footpaths, and the waymarked routes (GR, regional and local walks) are the ones worth following. The research in `docs/research/map-layers.md` (§3.2, §3.9) found two keyless candidates. Waymarked Trails' hiking overlay is a transparent world-wide tile layer under CC BY-SA 3.0 DE, which asks for moderate use, caching and a correct referrer. The SPW LiDAR hillshade is a WMS in EPSG:3857. On 2026-10-28 Waymarked Trails drew trails up to z18 and answered 404 at z19. The hillshade came back opaque grey inside Wallonia and transparent outside it.

## Decision
- **One overlay for now: Hiking trails (GLOSSARY: Hiking trails)**, from `tile.waymarkedtrails.org/hiking`. Off by default.
- **Drawing order:** base map < overlays (their own pane) < access layer < trip. The coloured waters and the route stay readable over the trail lines.
- **Full opacity at every zoom.** Native tiles go up to z18; on Aerial photos (z19) Leaflet upscales them. Tiles only, with nothing to click.
- **Remembered as a viewing preference:** the switched-on overlays are a list of overlay ids in the planner's settings (`packraft-go.settings`), never in the trip, its file or the GPX. Unknown ids are dropped on restore. The access layer still starts off on every load, because it fetches rules and live flows.
- **Where it's switched:** a Map menu on both layouts. On the phone it lists the base maps, then Access layer and Hiking trails. On the desktop, the button bottom right (now named "Map") lists the base maps, then Hiking trails; the access layer's switch stays in the access panel.
- **Attribution** while it is on: Waymarked Trails and OpenStreetMap contributors, CC BY-SA (text in `strings.ts`, ADR 0013).
- **Referrer:** the app sets no `Referrer-Policy`, so browsers send its origin, which is the "correct referrer" Waymarked Trails asks for.

## Considered options
- **SPW LiDAR hillshade:** opaque inside Wallonia, so it would hide the base map unless drawn partly transparent or blended. It covers Wallonia only, and OpenTopoMap already has hill shading. Not now.
- **Overlay switches in the desktop access panel:** that panel is about legal access to water; trails don't belong there.
- **A boolean setting per overlay:** simpler today, but every new overlay would add a field.

## Consequences
- One more party, Waymarked Trails, sees the area you view and your IP while the overlay is on.
- The manual `npm run check:basemaps` also requests one overlay tile (ADR 0019); it still never runs in CI.
- `serveOffline` serves the overlay's tiles from a fixture, so e2e tests never call it.
- New overlays are added to the overlay ids and the Map menus, not to the trip.
