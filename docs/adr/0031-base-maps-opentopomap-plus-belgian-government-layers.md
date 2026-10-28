# 31. Base maps: OpenTopoMap plus Belgian government layers

Date: 2026-10-28

## Status
Accepted

## Context
The map has one base map, OpenTopoMap (ADR 0014). It is good for hiking but shows little of what matters at the water's edge: weirs, banks, slipways, the way down to the river. Aerial photos show these. The research in `docs/research/map-layers.md` found that Belgium's regions publish recent, keyless aerial imagery that Leaflet can load as it is: Wallonia's SPW `ORTHO_LAST` (2026, 25 cm, WMS in EPSG:3857), Flanders' Digitaal Vlaanderen orthophoto mosaic (WMTS, GoogleMapsCompatible set) and Brussels' UrbIS (WMTS, CC0). The NGI's CartoWeb.be topo map is also keyless, but its licence is CC BY-NC. The well-known global imagery (Esri World Imagery) answers keyless requests, but its terms tie use to Esri software or an ArcGIS account. Thunderforest, Stadia, MapTiler and Mapbox all need a key or an account (ADR 0012).

## Decision
- **Three base maps (GLOSSARY: Base map), one at a time:** OpenTopoMap (the default), **Aerial photos (Belgium)** and **NGI topo (Belgium)**.
- **Aerial photos (Belgium) is one choice made of three regional sources:** the Walloon WMS (transparent outside Wallonia), the Flemish WMTS (limited to Flanders' bounds, because it answers out-of-range tiles with HTTP 400) and UrbIS for Brussels.
- **OpenTopoMap is drawn underneath the two Belgian base maps**, so the map is never blank across the border (trips cross it, e.g. on the Semois).
- **Zoom:** the aerial base map goes to zoom 19; the topographic ones stay at 17. Switching to a topo map while zoomed in further zooms out to 17.
- **The choice is a viewing preference on the device:** stored with the planner's settings (`packraft-go.settings`), never in the trip, its file or the GPX.
- **Each source keeps its own attribution**, shown by Leaflet's attribution control while that base map is on (text in `strings.ts`, ADR 0013).
- **No new runtime dependency:** `L.tileLayer` and `L.tileLayer.wms` cover every source. No WMTS plugin, no Proj4Leaflet.
- Overlays (GLOSSARY: Overlay) other than the access layer, such as hiking trails or hillshade, are a later decision.

## Considered options
- **Esri World Imagery:** global and sharp, but keyless use from Leaflet isn't covered by Esri's terms; the licensed route needs an ArcGIS account and a key with paid usage beyond the free tier (ADR 0012).
- **Keyed providers (Thunderforest, Stadia, MapTiler, Mapbox):** a key or account in a public static site, quotas and, for most, no free satellite imagery.
- **EOX Sentinel-2 cloudless:** keyless and global, but 10 m pixels show nothing of a river bank at planning zooms.
- **Leaflet's own layers control:** works, but doesn't match the Base UI screens (ADR 0020) and has no place in the phone layout (ADR 0026).
- **The Walloon WMTS:** Lambert 72 only; it would need Proj4Leaflet. The WMS serves the same imagery in Web Mercator.

## Consequences
- **NGI topo is only allowed for non-commercial use (CC BY-NC).** That fits personal use (ADR 0002). If the app ever becomes commercial, NGI topo must go or be licensed.
- Three to four more parties see the viewed area and your IP while their base map is on (Digitaal Vlaanderen says it logs IP, user agent and referer). OpenTopoMap still sees it under the Belgian maps.
- The Flemish service sends `no-store` and the Walloon WMS renders each tile on request, so aerial photos load more slowly than OpenTopoMap, more so on the phone.
- Government services may change URLs or end access without notice. A manual `npm run check:basemaps` requests one tile per source to catch this; it never runs in CI (ADR 0019).
- Tests serve every base map's tiles from fixtures; `serveOffline` learns the new hosts (ADR 0019).
- Outside Belgium the two Belgian choices show OpenTopoMap. Other regions (ADR 0004) need their own sources in the map config.
