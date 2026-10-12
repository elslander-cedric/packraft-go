# Data sources for access rules, routes and waterways

Researched 2026-10-12. This decides what packraft-go can *show* versus only *link to*. All services must stay free (ADR 0012).

## Summary

| Data | Machine-readable? | Licence | Usable in the app? |
|---|---|---|---|
| Walloon live river status (kayak.spw.wallonie.be) | No public API found | No terms published | **No**, unless the SPW agrees to a feed |
| Walloon stretches + put-in/take-out points (Metawal dataset) | Shapefile / FGDB, from 2014 | Restricted; redistribution forbidden | **No** |
| Walloon rules (AGW 2009, annexes) | Public legal text (PDF) | Public law | **Yes**, if encoded by hand |
| Walloon hydrometry (live river flows) | Probably | **[UNVERIFIED]** | To check: needed to compute daily status ourselves |
| Sport Vlaanderen routes (RouteYou) | Internal API only | No open licence found | **No**, without permission |
| Flemish waterway network (De Vlaamse Waterweg RIS-index) | WFS/WMS | Modellicentie Gratis Hergebruik (open) | **Yes** |
| Flemish rules (forbidden waters, lock ban) | Prose only | Public | **Yes**, if encoded by hand |
| OpenStreetMap paddling tags in Belgium | Yes (Overpass) | ODbL (open) | Too sparse to rely on; locks and waterway classes are usable |

**Conclusion:** there's no ready-made open feed for "can I paddle here today?". The realistic open route for Wallonia is to **encode the AGW rules ourselves** (stretch list, categories, seasons, hours, thresholds) and combine them with **live flows from Walloon hydrometry**, if its licence allows. Otherwise, the alternatives are asking the SPW for a feed or linking to kayak.spw.wallonie.be.

## Details

### Wallonia

- **Static kayak dataset** "Kayak – Aires et circulation en Région wallonne" ([Metawal record](https://metawal.wallonie.be/geonetwork/srv/api/records/634edbef-a925-41f4-9de1-fcac6a109361)):
  - contents: put-in and take-out points, plus the open stretches
  - format: Shapefile and FGDB, Belgian Lambert 72 coordinates (EPSG:31370)
  - last revised 1 June 2014, updated "irregularly"
  - access is **Restricted** (public bodies, contractors, research), and the SPW terms forbid redistributing it or publishing it as a web service
- **kayak.spw.wallonie.be (live status):**
  - a web app with an embedded ArcGIS map
  - no public JSON endpoint was found in its HTML or JavaScript, and no terms of use are shown
  - there's no kayak layer in the public map services ([geoservices.wallonie.be](https://geoservices.wallonie.be/arcgis/rest/services/MOBILITE/VOIESNAVIGABLES/MapServer) only has navigable waterways and hydrographic atlases)
  - scraping it would very likely go against the SPW's terms; ask info.kayak@spw.wallonie.be instead
- **Hydrographic atlases:** `EAU/ATLAS_HYDRO` and `EAU/RES_HYDRO_WAL` are public map services ([geoservices.wallonie.be/EAU](https://geoservices.wallonie.be/arcgis/rest/services/EAU)). **[UNVERIFIED]:** their licence. Many SPW datasets are CC BY 4.0.
- **Hydrometry (live flows):** **[UNVERIFIED]:** the API and licence of the Walloon hydrometry service weren't checked. This is the key open question for computing status ourselves.

### Flanders

- **Sport Vlaanderen routes:**
  - Hosted on RouteYou, a commercial route platform. The site loads them through an internal proxy (JSON-RPC calls), with geometry as an encoded polyline and fields for length, start, end and difficulty.
  - No open licence was found, and the routes aren't on the Flemish open-data portal. Treat them as not reusable without permission (contact: sportievevrijetijd@sport.vlaanderen).
  - **[UNVERIFIED]:** whether GPX downloads are free.
- **De Vlaamse Waterweg RIS-index** (waterway lines and network nodes):
  - available as WFS/WMS under the **Modellicentie Gratis Hergebruik**, an open licence that requires attribution
  - sources: [metadata (WMS)](https://metadata.vlaanderen.be/srv/api/records/a730cf61-2ae0-468e-ac8e-8c75ae76f754), [metadata](https://metadata.vlaanderen.be/29/api/records/5c412b19-f5af-4dea-b8ac-9e869a6f97b8)
- **Vlaamse Hydrografische Atlas (VHA):** gives the category, and so the manager, of each non-navigable river. **[UNVERIFIED]:** the current dataset and its licence.
- **Locks and high-speed zones:** shown on Visuris maps. **[UNVERIFIED]:** whether they're available as open WFS. OpenStreetMap has locks (`lock=yes`, `waterway=lock_gate`).

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

1. Check the Walloon hydrometry API: does it provide live flows per gauge, and is its licence open?
2. Get the full AGW Annex 1 (river list) and Annex 2 (gauges and thresholds) from Wallex.
3. Decide whether to email the SPW (info.kayak@spw.wallonie.be) to ask for a status feed or permission to reuse the stretch and aire data. Sending an email is Cedric's call.
4. Check the Visuris port regulations and the Flemish rules for non-navigable rivers, to close the open questions in [access-rules.md](access-rules.md).
