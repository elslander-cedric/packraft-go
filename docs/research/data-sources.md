# Data sources for access rules, routes and waterways

Researched 2026-10-12, updated 2026-11-02 from [kayak-spw-access-points.md](kayak-spw-access-points.md), [official-access-points-flanders-brussels.md](official-access-points-flanders-brussels.md) and the SPW's permission (ADR 0035). This decides what packraft-go can *show* versus only *link to*. All services must stay free (ADR 0012).

## Summary

| Data | Machine-readable? | Licence | Usable in the app? |
|---|---|---|---|
| Walloon live river status (kayak.spw.wallonie.be) | **Yes**: public `PKAYAK` ArcGIS service, no key, any origin. Uncatalogued and undocumented | SPW terms: no redistribution without written agreement | **Yes**: the SPW gave permission on 2026-11-02 (ADR 0035) |
| Walloon aires and stretch lines (`PKAYAK` layers 3 and 5) | **Yes**, same service | Same | **Yes, as a built-in snapshot** (ADR 0035) |
| Walloon stretches + put-in/take-out points (Metawal dataset) | Shapefile / FGDB, from 2014 | Restricted; redistribution forbidden | **No**, and not needed: `PKAYAK` has the same kind of data and is fresher |
| Walloon rules (AGW 2009, annexes) | Public legal text (PDF), **now extracted** to [data/walloon-stretches.json](data/walloon-stretches.json) | Public law | **Yes**. Stretch ends still need placing on the map (about 45 landmarks, 2–4 h of curation) |
| Walloon hydrometry (live river flows) | **Yes**: public KiWIS JSON API, no key, CORS open | No named licence; attribution required; publishing needs the SPW's written agreement | **Yes**: the SPW has no objection (ADR 0022). See [hydrometry.md](hydrometry.md) |
| Sport Vlaanderen routes (RouteYou) | Internal API, plus GPX links and street addresses of start points on the route pages | No open licence found | **No**, without permission |
| Flemish access points (VMM boards and agreements, De Vlaamse Waterweg list) | **No dataset**: PDFs, images and web pages | De Vlaamse Waterweg: no reuse without written permission. VMM: free model licence for datasets, PDFs unclear | **No**, without permission. See [official-access-points-flanders-brussels.md](official-access-points-flanders-brussels.md) |
| Brussels canal charts (Port IENC) | S-57 ZIP | CC0 | **Yes**, but they hold no access points for paddlers |
| Flemish waterway network (De Vlaamse Waterweg RIS-index) | WFS/WMS | Modellicentie Gratis Hergebruik (open) | **Yes** |
| Flemish rules (forbidden waters, ports, lock ban) | Prose only | Public | **Yes**, if encoded by hand. A short list, since non-navigable rivers are allowed by default |
| Flemish river categories and managers (VHA Waterlopen) | WFS | Open Data Licentie Vlaanderen | **Yes** |
| OpenStreetMap paddling tags in Belgium | Yes (Overpass) | ODbL (open) | Too sparse to rely on; locks and waterway classes are usable |

**Conclusion:** the first answer here was that there's no feed for "can I paddle here today?", so the Walloon status had to be **computed in the browser**: encode the AGW rules ourselves (stretch list, categories, seasons, hours, thresholds) and combine them with **live flows from the public KiWIS API**. That still works as the fallback, but the forecast rule and ad-hoc closures can't be computed. The 2026-11-01 research found the SPW's own status in the public `PKAYAK` service, and the SPW has since allowed the app to read it (ADR 0035). See [hydrometry.md](hydrometry.md) and [kayak-spw-access-points.md](kayak-spw-access-points.md).

## Details

### Wallonia

- **Static kayak dataset** "Kayak – Aires et circulation en Région wallonne" ([Metawal record](https://metawal.wallonie.be/geonetwork/srv/api/records/634edbef-a925-41f4-9de1-fcac6a109361)):
  - contents: put-in and take-out points, plus the open stretches
  - format: Shapefile and FGDB, Belgian Lambert 72 coordinates (EPSG:31370)
  - last revised 1 June 2014, updated "irregularly"
  - access is **Restricted** (public bodies, contractors, research), and the SPW terms forbid redistributing it or publishing it as a web service
  - the app doesn't use this dataset: its aires and stretch lines come from `PKAYAK`, under the permission in ADR 0035
- **kayak.spw.wallonie.be (live status):**
  - a web app with an embedded ArcGIS map
  - it does have public endpoints, which the first research missed. Its own REST API has no CORS. The [`PKAYAK` map service](https://geoservices3.wallonie.be/arcgis/rest/services/APP_KAYAK/PKAYAK/MapServer) on `geoservices3.wallonie.be` has aires, stretches with status, obstacles and incidents, needs no key and allows any origin. Details: [kayak-spw-access-points.md](kayak-spw-access-points.md)
  - no terms of use are shown on the site, and the service has no Metawal record of its own
  - the app reads it under the permission in ADR 0035, and doesn't scrape the REST API
- **Hydrographic atlases:** `EAU/ATLAS_HYDRO` and `EAU/RES_HYDRO_WAL` are public map services ([geoservices.wallonie.be/EAU](https://geoservices.wallonie.be/arcgis/rest/services/EAU)). **[UNVERIFIED]:** their licence. Many SPW datasets are CC BY 4.0.
- **Hydrometry (live flows):** checked. hydrometrie.wallonie.be has a public KiWIS JSON API with 72-hour mean and hourly flows per gauge, no key and open CORS. Attribution is required, and publishing the data needs the SPW's written agreement. Full details, request patterns and the gauge mapping are in [hydrometry.md](hydrometry.md).

### Flanders

- **Sport Vlaanderen routes:**
  - Hosted on RouteYou, a commercial route platform. The site loads them through an internal proxy (JSON-RPC calls), with geometry as an encoded polyline and fields for length, start, end and difficulty.
  - No open licence was found, and the routes aren't on the Flemish open-data portal. Treat them as not reusable without permission (contact: sportievevrijetijd@sport.vlaanderen).
  - GPX: a route page carries links on `download.routeyou.com`, served to an anonymous visitor (observed on the Kleine Nete page, 2026-11-02). They embed an authorisation token and weren't called. **[UNVERIFIED]:** whether a GPX holds the start points, and RouteYou's terms.
  - Each route page lists its start points as street addresses: 74 lines across the 12 routes, about 72 distinct.
- **Access points:** no dataset in any regional catalogue searched. De Vlaamse Waterweg's [list of 172 places](https://www.visuris.be/download/17b25fd3-9d05-4317-add5-c2fe0fd3b3e0?dl=0) is a PDF with no coordinates, and VMM's 43 points are in PDFs and images. Details and terms: [official-access-points-flanders-brussels.md](official-access-points-flanders-brussels.md).
- **De Vlaamse Waterweg RIS-index** (waterway lines and network nodes):
  - available as WFS/WMS under the **Modellicentie Gratis Hergebruik**, an open licence that requires attribution
  - sources: [metadata (WMS)](https://metadata.vlaanderen.be/srv/api/records/a730cf61-2ae0-468e-ac8e-8c75ae76f754), [metadata](https://metadata.vlaanderen.be/29/api/records/5c412b19-f5af-4dea-b8ac-9e869a6f97b8)
- **Vlaamse Hydrografische Atlas (VHA):** gives the category, and so the manager, of each non-navigable river. **[UNVERIFIED]:** the current dataset and its licence.
- **Locks and high-speed zones:** shown on Visuris maps. The pleasure boating map loads boat ramps, marinas and high-speed zones from undocumented query endpoints (observed 2026-11-02), but the [Visuris terms](https://www.visuris.be/Voorwaarden?KL=nl) forbid reuse without written permission and ban automated collection, so they aren't usable. **[UNVERIFIED]:** whether locks are available as open WFS. OpenStreetMap has locks (`lock=yes`, `waterway=lock_gate`).

### OpenStreetMap (Belgium, data up to 2026-10-11, [taginfo](https://taginfo.geofabrik.de/europe:belgium/))

| Tag | Count in Belgium |
|---|---|
| `canoe=*` | ~270 (yes 132, no 116, put_in 12, …; 2 objects encode the Walloon 1.C season) |
| `portage=yes` | 12 |
| `whitewater=*` | 8 |
| `route=canoe` relations | 1 |
| `leisure=slipway` | 238 |
| `CEMT=*` (waterway class) | ~1,000 |

These counts are far too sparse to base access rules on. `CEMT` and lock tags are usable to detect navigable waterways and locks. The tag definitions are on the OSM wiki: [canoe](https://wiki.openstreetmap.org/wiki/Key:canoe) and [portage](https://wiki.openstreetmap.org/wiki/Key:portage).

## Next steps (for v2 planning)

1. ~~Check the Walloon hydrometry API.~~ Done: see [hydrometry.md](hydrometry.md).
2. ~~Get AGW Annex 2.~~ Done: all 26 stretches with gauges and thresholds are in [hydrometry.md](hydrometry.md#5-gauge-coverage-agw-annex-2-mapped-to-kiwis). Annex 1 (river list and categories) is at [wallex 6393.pdf](https://wallex.wallonie.be/files/medias/0/6393.pdf) and still needs extracting.
3. ~~Ask the SPW for written permission to show flows and a derived status, and ask which gauge is used for Wanlin (Lesse).~~ Done: see ADRs 0022 and 0035. The SPW's own data shows Hérock in place of Wanlin.
4. Check the Visuris port regulations and the Flemish rules for non-navigable rivers, to close the open questions in [access-rules.md](access-rules.md).
