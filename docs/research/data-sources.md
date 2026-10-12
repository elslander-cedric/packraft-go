# Data sources for access rules, routes and waterways

Researched 2026-10-12. This decides what packraft-go can *show* versus only *link to*. All services must stay free (ADR 0012).

## Summary

| Data | Machine-readable? | Licence | Usable in the app? |
|---|---|---|---|
| Walloon live river status (kayak.spw.wallonie.be) | No public API found | No terms published | **No**, unless the SPW agrees to a feed |
| Walloon stretches + put-in/take-out points (Metawal dataset) | Shapefile / FGDB, from 2014 | Restricted; redistribution forbidden | **No** |
| Walloon rules (AGW 2009, annexes) | Public legal text (PDF), **now extracted** to [data/walloon-stretches.json](data/walloon-stretches.json) | Public law | **Yes**. Stretch ends still need placing on the map (about 45 landmarks, 2–4 h of curation) |
| Walloon hydrometry (live river flows) | **Yes**: public KiWIS JSON API, no key, CORS open | No named licence; attribution required; publishing needs the SPW's written agreement | **Technically yes; legally needs SPW permission.** See [hydrometry.md](hydrometry.md) |
| Sport Vlaanderen routes (RouteYou) | Internal API only | No open licence found | **No**, without permission |
| Flemish waterway network (De Vlaamse Waterweg RIS-index) | WFS/WMS | Modellicentie Gratis Hergebruik (open) | **Yes** |
| Flemish rules (forbidden waters, ports, lock ban) | Prose only | Public | **Yes**, if encoded by hand. A short list, since non-navigable rivers are allowed by default |
| Flemish river categories and managers (VHA Waterlopen) | WFS | Open Data Licentie Vlaanderen | **Yes** |
| OpenStreetMap paddling tags in Belgium | Yes (Overpass) | ODbL (open) | Too sparse to rely on; locks and waterway classes are usable |

**Conclusion:** there's no ready-made open feed for "can I paddle here today?". But the Walloon status **can be computed in the browser**: encode the AGW rules ourselves (stretch list, categories, seasons, hours, thresholds) and combine them with **live flows from the public KiWIS API**, which needs no key and allows CORS. This covers about 25 of 26 stretches. The forecast rule and ad-hoc closures can't be computed, and **publishing the derived status needs written permission from the SPW**. See [hydrometry.md](hydrometry.md).

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
- **Hydrometry (live flows):** checked. hydrometrie.wallonie.be has a public KiWIS JSON API with 72-hour mean and hourly flows per gauge, no key and open CORS. Attribution is required, and publishing the data needs the SPW's written agreement. Full details, request patterns and the gauge mapping are in [hydrometry.md](hydrometry.md).

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

1. ~~Check the Walloon hydrometry API.~~ Done: see [hydrometry.md](hydrometry.md).
2. ~~Get AGW Annex 2.~~ Done: all 26 stretches with gauges and thresholds are in [hydrometry.md](hydrometry.md#5-gauge-coverage-agw-annex-2-mapped-to-kiwis). Annex 1 (river list and categories) is at [wallex 6393.pdf](https://wallex.wallonie.be/files/medias/0/6393.pdf) and still needs extracting.
3. **Ask the SPW for written permission** to show flows and a derived status, and ask which gauge is used for Wanlin (Lesse). Contacts: [hydrometrie.wallonie.be/contact](https://hydrometrie.wallonie.be/contact.html) and info.kayak@spw.wallonie.be. Sending the email is Cedric's call.
4. Check the Visuris port regulations and the Flemish rules for non-navigable rivers, to close the open questions in [access-rules.md](access-rules.md).
