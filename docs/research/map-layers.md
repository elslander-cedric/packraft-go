# Map base layers: can packraft-go offer aerial, terrain and other topo maps besides OpenTopoMap?

Researched 2026-10-28. Every live test was a single request (one capabilities document or one tile) made that day. Not legal advice. Terms and URLs change: re-check before building.

## TL;DR

- **Yes, and without any API key for the best options.** Belgium's own governments publish free, keyless aerial imagery that a Leaflet raster layer can load directly in Web Mercator (EPSG:3857), the app's current projection:
  - **Wallonia (SPW) "ORTHO_LAST"**: the 2026 campaign at 25 cm, through **WMS** in EPSG:3857 (its WMTS is Lambert 72 only). Free for any user; don't overload the servers; don't hide the source mention.
  - **Flanders (Digitaal Vlaanderen) "Orthofotomozaïek, meest recent"**: **WMTS with a GoogleMapsCompatible tile matrix set** (`GoogleMapsVL`), "Modellicentie voor gratis hergebruik", attribution "Bron: Luchtopnamen Digitaal Vlaanderen".
  - **Brussels (UrbIS)**: WMTS with an EPSG:900913 (= 3857) tile matrix set, **CC0**.
- **Topo alternative: NGI CartoWeb.be "topo"** has an EPSG:3857 tile matrix set (zoom 7 to 17), keyless, but **CC BY-NC**: fine for personal, non-commercial use (ADR 0002), not if the app ever goes commercial.
- **Hiking overlay: Waymarked Trails** (transparent PNG, keyless, CC BY-SA 3.0 DE, "moderate" use allowed). Useful for portages.
- **Esri World Imagery is not recommended.** Its tiles answer keyless requests, but Esri's terms say its content is to be used "with Esri software" or an ArcGIS subscription; outside that, Esri's route is an ArcGIS Location Platform account and API key. Keyless use from Leaflet is not covered by the terms.
- **Keyed commercial tiers (Thunderforest, Stadia, MapTiler, Mapbox) are possible but add a key or account**, conflicting with ADR 0012's preference. Thunderforest without a key returns watermarked tiles ("API Key Required"). Stadia's free plan has no satellite and is non-commercial only.
- **Technically easy.** Leaflet 1.9.4 (installed) handles all recommended layers with `L.tileLayer` (templated URLs, including a WMTS KVP query string) and `L.tileLayer.wms`, so **no new runtime dependency** and no WMTS plugin. Only Lambert-72-only services (the Walloon WMTS) would need Proj4Leaflet, which isn't needed because the WMS covers it.

---

## 1. What the app does today

| Fact | Source |
|---|---|
| One base layer, OpenTopoMap, `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`, subdomains a/b/c, `maxZoom: 17`, attribution from `strings.mapAttribution`. | `src/map/mapConfig.ts` |
| Desktop (`TripMap.tsx`) and phone (`PhoneMap.tsx`) each render one react-leaflet `<TileLayer>` from `baseLayer`. There is no layer switcher (`L.control.layers`) today. | `src/map/TripMap.tsx` (around line 309), `src/map/PhoneMap.tsx` (around line 399) |
| **The phone's "layers button" toggles the access layer, not the base map.** It sits under the position button, is labelled `strings.accessLayerToggle` ("Access layer"), and calls `layer.setOn(!layer.on)` from `useAccessLayer`. The desktop equivalent is a `Switch` in `AccessPanel.tsx`. | `src/ui/phone/PhonePlanner.tsx` (lines 359 to 363), `src/ui/strings.ts` (lines 275, 305), `src/ui/AccessPanel.tsx` (line 72) |
| The service worker never caches map tiles. | `public/sw.js` (header comment), ADR 0023 ("Offline map tiles are out of scope") |
| e2e tests serve every `*.tile.opentopomap.org` request from one PNG fixture, record the z/x/y, and **abort and record every other external request** (`blocked`). Several specs assert `blocked` is empty. | `e2e/support/offline.ts` (`serveOffline`), e.g. `e2e/acceptance-10.spec.ts` line 127 |
| `mapConfig.test.ts` asserts the base layer is OpenTopoMap and credits OSM, OpenTopoMap and BRouter. | `src/map/mapConfig.test.ts` |
| Runtime dependencies are allowlisted. Leaflet and react-leaflet are already allowed. | `src/ui/components/boundary.test.ts` (`ALLOWED_RUNTIME_PACKAGES`), `package.json` |

Installed versions: `leaflet` 1.9.4, `react-leaflet` 5.0.0 (`node_modules/*/package.json`). react-leaflet ships `WMSTileLayer` and `LayersControl` (`node_modules/react-leaflet/lib/`).

## 2. Comparison

"3857?" = does the service offer Web Mercator tiles (or WMS in EPSG:3857) that Leaflet's default CRS can use? "Tested" = one request on 2026-10-28 returned a 256x256 image.

| Provider / layer | Type | Coverage | Key? | Licence / terms | Attribution | 3857? | Max zoom | Verdict |
|---|---|---|---|---|---|---|---|---|
| **OpenTopoMap** (current) | Topo | World | No | CC BY-SA; embedding welcome if no mass downloads | "Kartendaten: © OpenStreetMap-Mitwirkende, SRTM \| Kartendarstellung: © OpenTopoMap (CC-BY-SA)" | Yes | 17 in our config (z18 answered 200; see §6) | Keep as default |
| **SPW ORTHO_LAST** (Wallonia) | Aerial, 2026, 25 cm | Wallonia (transparent PNG outside) | No | SPW conditions for visualisation web services: free for any user, no disproportionate use, don't hide mentions | SPW (service copyright "SPW (2026)") | **WMS yes**, WMTS no (31370 only) | Any (WMS renders on demand) | **Recommend** |
| **SPW MNT 2021-2022 hillshade** (Wallonia) | LiDAR hillshade | Wallonia | No | Same SPW conditions | SPW | WMS yes | Any | Recommend as overlay (optional) |
| **Digitaal Vlaanderen orthophoto** (OMWRGBMRVL) | Aerial, winter, most recent (2025.04) | Flanders (+ margin; 400 outside its tile range) | No | Modellicentie voor gratis hergebruik | "Bron: Luchtopnamen Digitaal Vlaanderen" | **Yes** (`GoogleMapsVL`) | 21 | **Recommend** |
| **Digitaal Vlaanderen GRB** | Large-scale base map | Flanders | No | Per dataset metadata [UNVERIFIED: GRB licence not read] | Digitaal Vlaanderen | Yes (`GoogleMapsVL`) | 21 | Possible, low priority |
| **UrbIS Ortho** (Brussels) | Aerial (2024 layers exist) | Brussels region | No | CC0 (capabilities `Fees`) | Not required by CC0; courtesy "UrbIS, paradigm.brussels" [UNVERIFIED wording] | Yes (`EPSG:900913`) | 30 matrices listed | Optional (Brussels matters little for paddling) |
| **NGI CartoWeb.be topo** | Topo (Belgian national) | Belgium (+ `crossborder` layer) | No | **CC BY-NC**; no automated downloading; commercial use paid | NGI/IGN; plus TomTom at 1:2,500 to 1:10,000 | **Yes** (`3857`, z7 to z17) | 17 | **Recommend** (personal use) |
| **EOX Sentinel-2 cloudless** | Satellite, 10 m | World | No | 2016 layer CC BY 4.0; 2018+ layers CC BY-NC-SA 4.0 | "Sentinel-2 cloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data YYYY)" | Yes (`GoogleMapsCompatible`) | 22 matrices, but 10 m data | Low-zoom only; not useful for river detail |
| **Esri World Imagery / Topo / Hillshade** | Aerial / topo / hillshade | World | **Account + key per terms** | Esri Master License Agreement; "use with Esri software" or subscription; no offline export | "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community" | Yes | 23 (24 LODs) | **Not recommended** |
| **Waymarked Trails hiking** | Overlay (routes) | World | No | CC BY-SA 3.0 DE; "moderate" access; cache; correct referrer; no mass download | OpenStreetMap + waymarkedtrails.org | Yes | [UNVERIFIED] | **Recommend as overlay** |
| **CyclOSM** | Cycling topo | World | No | OSM-France, "fair use" pointing to the OSMF tile policy | OSM + CyclOSM [UNVERIFIED wording] | Yes | [UNVERIFIED] | Possible, not paddling-relevant |
| **OSM standard** (`tile.openstreetmap.org`) | Street map | World | No | OSMF tile usage policy (no prefetch, valid Referer, attribution) | © OpenStreetMap contributors | Yes | 19 [UNVERIFIED] | Possible fallback |
| **OpenSeaMap seamark** | Overlay (marks, locks) | World, sparse inland | No | Tiles CC BY-SA 2.0 (FAQ) | © OpenSeaMap, OSM | Yes | [UNVERIFIED] | Low value inland [UNVERIFIED] |
| **Thunderforest Outdoors / Landscape** | Topo | World | **Yes** (watermark without) | Free "Hobby Project" 150,000 tiles/month | Thunderforest + OSM | Yes | [UNVERIFIED] | Only if a key is accepted |
| **Stadia (Stamen Terrain)** | Terrain | World | Domain auth (no key in code) or key | Free plan 200,000 credits/month, "Commercial use not allowed"; **no satellite on free** | Stadia, Stamen, OpenMapTiles, OSM | Yes | 20 | Possible, needs an account |
| **MapTiler** | Topo / satellite | World | Yes | Free plan: personal / non-commercial; pauses at quota; logo on map | MapTiler logo + attribution | Yes | [UNVERIFIED] | Only if a key is accepted |
| **Mapbox** | Satellite | World | Yes (token) | Raster Tiles API: 750,000 free requests/month | Mapbox + OSM [UNVERIFIED] | Yes | [UNVERIFIED] | Only if a key is accepted |

## 3. Detail per candidate

### 3.1 OpenTopoMap (current)

- Licence CC BY-SA. Free use with attribution and share-alike. Embedding in websites and apps is welcome as long as the server isn't overloaded, for example by mass downloads. The maintainers ask for a short notice of use. No availability guarantee. Source: https://opentopomap.org/about
- Required attribution: "Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)". The app's `strings.mapAttribution` already credits OSM, SRTM and OpenTopoMap. Source: https://opentopomap.org/about
- Tested: `https://a.tile.opentopomap.org/12/2108/1384.png` returned 200, `image/png`, `Access-Control-Allow-Origin: *`, `cache-control: max-age=604800`.

### 3.2 Wallonia: SPW orthophotos and hillshade

- The `IMAGERIE` folder on `geoservices.wallonie.be` holds yearly orthophoto services from 1971 to `ORTHO_2026_PRINTEMPS`, plus `ORTHO_LAST` and `ORTHO_LAST_IR`. Source: https://geoservices.wallonie.be/arcgis/rest/services/IMAGERIE?f=json
- `ORTHO_LAST` serves the 2026 campaign at 25 cm, updated yearly. Source: https://geoportail.wallonie.be/catalogue/385d8e9c-2c01-41c7-a38c-911f746c8877.html
- **CRS:** the REST service's spatial reference is EPSG:31370 (https://geoservices.wallonie.be/arcgis/rest/services/IMAGERIE/ORTHO_LAST/MapServer?f=json). Its **WMTS** has one tile matrix set, `default028mm`, in `urn:ogc:def:crs:EPSG::31370` (https://geoservices.wallonie.be/arcgis/rest/services/IMAGERIE/ORTHO_LAST/MapServer/WMTS/1.0.0/WMTSCapabilities.xml). So the WMTS can't be used with Leaflet's default CRS.
- **WMS supports EPSG:3857** (also 31370, 3812, 4326, 4258, CRS:84). Source: https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer?request=GetCapabilities&service=WMS
- Tested: a 256x256 `GetMap` in EPSG:3857, layer `0`, around the Ourthe (z12 tile 2108/1384) returned 200 `image/jpeg` showing imagery. The same request in PNG with `TRANSPARENT=TRUE` over Ghent returned an 888-byte transparent PNG, so the layer is **transparent outside Wallonia** and can be stacked with the Flemish one. Responses carry `cache-control: private` and echo the request's `Origin` in `Access-Control-Allow-Origin`.
- **Terms** (Conditions d'accès et d'utilisation des services web géographiques de visualisation du SPW, v1.1, 3 August 2016): free access and use for any user (Art. 3 §1); no "disproportionate or unsuitable" calls that could congest the servers (Art. 5 §1); any mention provided by the services may not be hidden or removed (Art. 5 §3); the SPW may limit, change or end access without notice (Art. 6 §4, Art. 7). Source: https://geoportail.wallonie.be/files/documents/ConditionsSPW/LicServicesSPW.pdf (linked from the catalogue record above)
- **Data licence** for ORTHO_LAST: the catalogue record points to the conditions above and suggests citing "SPW" with the dataset title. **[UNVERIFIED]**: whether a separate data licence (e.g. CC BY 4.0) applies to the imagery. The service's `copyrightText` is "SPW (2026)".
- **Hillshade:** `RELIEF/WALLONIE_MNT_2021_2022_HILLSHADE` (LiDAR terrain model) and others exist. Tested: WMS `GetMap` in EPSG:3857 returned 200 `image/png`. Source: https://geoservices.wallonie.be/arcgis/rest/services/RELIEF?f=json
- Topographic layers in the `IGN` folder (`TOP10s_NB`, `FOND_IGN_NB`, `CONTOURLINES`) are NGI data republished by the SPW. Not investigated further. Source: https://geoservices.wallonie.be/arcgis/rest/services/IGN?f=json

### 3.3 Flanders: Digitaal Vlaanderen orthophotos

- WMTS `https://geo.api.vlaanderen.be/OMWRGBMRVL/wmts`, layer `omwrgbmrvl`, "Orthofotomozaïek, middenschalig, winteropnamen, kleur, meest recent, Vlaanderen". Tile matrix sets: **`GoogleMapsVL` (EPSG:3857, WellKnownScaleSet GoogleMapsCompatible, matrices 0 to 21)**, `BPL72VL` (31370), `BPL2008VL` (3812), `WGS84VL`. Format `image/png`. Capabilities: `Fees` "Het gebruik van de service is kosteloos" (use is free). Source: https://geo.api.vlaanderen.be/OMWRGBMRVL/wmts?SERVICE=WMTS&REQUEST=GetCapabilities
- No RESTful `ResourceURL` is advertised; only KVP. Tested: a KVP `GetTile` with `TILEMATRIXSET=GoogleMapsVL&TILEMATRIX=15` over Ghent returned 200 `image/png` showing imagery. A REST-style path returned 404.
- **Out-of-range tiles return HTTP 400** with an OWS `TileOutOfRange` exception ("Row 1384 is out of range, min: 1361 max:1377"). Leaflet would show broken tiles outside Flanders unless the layer gets `bounds`.
- Responses send `cache-control: no-store, must-revalidate, no-cache` and `Access-Control-Allow-Origin: *`. The browser won't cache them, so each pan re-downloads.
- **Licence** (dataset metadata): "Modellicentie voor gratis hergebruik"; attribution rule "Bron: Luchtopnamen Digitaal Vlaanderen"; no limits on public access. The current mosaic is "2025.04". Sources: https://metadata.vlaanderen.be/srv/dut/catalog.search#/metadata/f5304d6d-0dd4-43fd-a726-427af31e8d61 and https://data.vlaanderen.be/id/licentie/modellicentie-gratis-hergebruik/v1.0
- **Service terms and privacy:** anyone may use the service, without guarantees. Digitaal Vlaanderen logs client IP, user agent and referer for up to 90 days to detect "suspicious or invasive use". Source: https://www.vlaanderen.be/digitaal-vlaanderen/onze-oplossingen/geografische-webdiensten/gebruiksrecht-en-privacyverklaring-geografische-webdiensten
- **GRB** (`https://geo.api.vlaanderen.be/GRB/wmts`): layers `grb_bsk`, `grb_bsk_grijs`, `grb_sel`, same four tile matrix sets including `GoogleMapsVL`. Source: https://geo.api.vlaanderen.be/GRB/wmts?SERVICE=WMTS&REQUEST=GetCapabilities
- **[UNVERIFIED]**: a Flemish waterway overlay (VHA). `https://geo.api.vlaanderen.be/VHAWaterlopen/wms?...GetCapabilities` returned a 302 and wasn't followed.

### 3.4 Brussels: UrbIS

- WMTS `https://geoservices-urbis.irisnet.be/geowebcache/service/wmts`, layers include `Ortho`, `Ortho2024Eo`, `Ortho2024Ns`, `Ortho2023RGB` and the `urbis` base maps. Tile matrix sets: `EPSG:31370`, `EPSG:4326`, **`EPSG:900913`** (Web Mercator; matrix IDs `EPSG:900913:0` to `EPSG:900913:30`). REST template: `.../wmts/rest/{layer}/{style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}?format=image/jpeg`. Capabilities: `AccessConstraints` "No limitations to public access"; `Fees` "Creative Commons (CC-0)". Source: https://geoservices-urbis.irisnet.be/geoserver/gwc/service/wmts?REQUEST=GetCapabilities
- Tested: `.../rest/Ortho/default/EPSG:900913/EPSG:900913:15/{y}/{x}?format=image/jpeg` over central Brussels returned 200 with imagery; `Access-Control-Allow-Origin: *`; `cache-control: max-age=2592000`.
- Brussels has little paddling (see [brussels.md](brussels.md)), so this is optional.

### 3.5 NGI/IGN CartoWeb.be

- WMTS `https://cartoweb.wmts.ngi.be/1.0.0/WMTSCapabilities.xml`, layers `topo`, `topo_grey`, `overlay`, `crossborder`, `crossborder_grey`. Tile matrix sets `3812` and **`3857`**. The 3857 set has matrices `7` to `17`, top-left −20037508.34/20037508.34, so the IDs equal standard XYZ zooms. REST template: `https://cartoweb.wmts.ngi.be/1.0.0/topo/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png`. Source: the capabilities document above.
- Tested: `https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/12/1384/2108.png` returned 200 `image/png`, `Access-Control-Allow-Origin: *`, `max-age=86400`.
- **Terms:** "free for any non-commercial use (CC-BY-NC)"; no automated download programs; no derivative works that compromise accuracy; no printing larger than A3; commercial use costs €60 to €15,360 a year. Credit NGI; also TomTom for TOPO, TOPO-GREY and OVERLAY at 1:2,500 to 1:10,000, and EuroGeographics for CROSSBORDER. Source: https://www.ngi.be/website/gebruiksvoorwaarden-cartoweb-be/ (linked from the capabilities `AccessConstraints`)
- **[UNVERIFIED]**: exact attribution wording for non-commercial use. The terms page gives none.
- NGI national orthophotos: only decade-specific historical WMTS services were found (e.g. `wmts.ngi.be/orthophotos_2010s`). No current national ortho WMTS was confirmed. Sources: https://www.ngi.be/website/fr/offre/geodonnees-numeriques/orthophotos/ and https://publish.geo.be/geonetwork/srv/api/records/2363a560-29ff-11f1-a24a-20c19bc9b64c. The regional orthos above are newer anyway.

### 3.6 EOX Sentinel-2 cloudless

- WMTS `https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml`: `s2cloudless-YYYY_3857` layers on `GoogleMapsCompatible` / `g`, plus `terrain_3857` and overlays. Template: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`. Source: the capabilities document.
- Licence per layer abstract: `s2cloudless_3857` (2016 data) is CC BY 4.0. 2018 and later layers are **CC BY-NC-SA 4.0**. "Proper attribution is required for any usage", following the demo map at https://maps.eox.at. Source: the capabilities document (`AccessConstraints` and layer abstracts).
- Tested: the 2024 layer at z12 returned 200 `image/jpeg`.
- Sentinel-2 is 10 m resolution, so river banks, weirs and put-ins aren't visible at planning zooms. **[UNVERIFIED]**: EOX's stated maximum useful zoom.

### 3.7 Esri World Imagery, World Topo, World Hillshade

- Services at `https://server.arcgisonline.com/ArcGIS/rest/services/{World_Imagery|World_Topo_Map|Elevation/World_Hillshade}/MapServer`, Web Mercator (wkid 102100/3857), 24 levels of detail. World Imagery copyright text: "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community". Tested: tiles answer 200 without a key, with `Access-Control-Allow-Origin: *`. Source: e.g. https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=json
- **Terms:** the item is "licensed under the Esri Master License Agreement". "This layer is not intended to be used to export tiles for offline." Source: https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9?f=json (`licenseInfo`)
- Esri's terms-of-use summary (last updated 21 April 2025) says to use Esri-owned items "in conjunction with Esri software or an ArcGIS Online subscription", under conditions including attribution and "Use with Esri software... If you do not have Esri software, you must purchase an ArcGIS Online subscription". It forbids redistributing basemap tiles and downloading or self-hosting Esri content. Source: https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf (via https://goto.arcgis.com/termsofuse/viewsummary)
- Esri's own Leaflet route: "An ArcGIS Location Platform or ArcGIS Online account is required to use the services." Source: https://developers.arcgis.com/esri-leaflet/. Location Platform basemap tiles: 2M free per month, then $0.15 per 1,000. Source: https://location.arcgis.com/pricing/
- **Verdict:** keyless use of `server.arcgisonline.com` from Leaflet works technically but isn't clearly licensed. The licensed route needs an account, a public key and a billing relationship that can charge beyond the free tier. That conflicts with ADR 0012 and Cedric's "ask before anything that costs money".

### 3.8 Keyed commercial providers

- **Thunderforest** (Outdoors, Landscape): free "Hobby Project" tier of 150,000 tile requests a month. Bulk downloading only on Small Business and higher plans. Source: https://www.thunderforest.com/pricing/. Keys identify requests with your account and go at the end of the URL. Source: https://www.thunderforest.com/docs/apikeys/. Tested: `https://tile.thunderforest.com/outdoors/12/2108/1384.png` without a key returned 200, but the image is watermarked "API Key Required".
- **Stadia Maps** (hosts Stamen Terrain): Free plan 200,000 credits a month, "Commercial use not allowed", satellite only from the paid Standard plan. Source: https://stadiamaps.com/pricing. Browser apps use **domain-based auth** (Origin/Referer, no key in code); localhost works keyless under strict rate limits. Source: https://docs.stadiamaps.com/authentication/. Stamen Terrain URL `https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png` (EU: `tiles-eu.stadiamaps.com`), max zoom 20; credit Stadia Maps, Stamen Design, OpenMapTiles and OpenStreetMap. Source: https://docs.stadiamaps.com/map-styles/stamen-terrain/
- **MapTiler:** Free plan for "testing, PoC, prototyping, personal, or non-commercial use"; 100k API requests and 5k sessions a month; service pauses at quota; MapTiler logo on the map; 1 API key. **[UNVERIFIED]**: whether Satellite is on the free plan. Source: https://www.maptiler.com/cloud/pricing/
- **Mapbox:** Raster Tiles API (satellite) up to 750,000 free monthly requests; Static Tiles API up to 200,000. Source: https://www.mapbox.com/pricing. **[UNVERIFIED]**: whether account creation needs a payment method. Not read.
- All of these put a key (or a registered domain) in a public static site. ADR 0012 already notes keys in a static site "are public anyway".

### 3.9 OSM-based overlays and alternatives

- **OSM standard tiles:** attribution clearly visible; valid Referer for web use (no restrictive Referrer-Policy); honour cache headers; **no prefetching or "download for offline"**; heavy use can be blocked without notice; best effort, no SLA. Source: https://operations.osmfoundation.org/policies/tiles/
- **CyclOSM:** `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`, hosted by OpenStreetMap France under a "fair use" tile policy that links to the OSMF policy. Source: https://www.cyclosm.org/. Tested: 200.
- **Waymarked Trails hiking overlay:** `https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png` (tested: 200, transparent PNG, `Access-Control-Allow-Origin: *`). Terms: overlay under CC BY-SA 3.0 Germany; reuse must mention OpenStreetMap and the site. "You may use the overlay on other sites as long as access rates are moderate. Please cache tiles as often as possible and use a correct referrer. Mass download of tiles is strongly discouraged." Source: the site's own help text, https://github.com/waymarkedtrails/waymarkedtrails-website/blob/master/src/i18n/en-gb/helppages.yaml (shown at https://hiking.waymarkedtrails.org/#help-legal). No paddling or canoe layer was found among its themes **[UNVERIFIED]**.
- **OpenSeaMap seamark overlay:** `https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png` (tested: 200, transparent). The FAQ says the chart tiles are CC BY-SA 2.0 and the chart may be embedded in websites. Source: https://www.openseamap.org/index.php?id=faq&L=1. **[UNVERIFIED]**: a current written tile usage policy (the wiki page tried returned 404), and how much inland Belgian content (locks, weirs) it shows.
- **Paddling-specific overlays:** the app's own access layer already draws the waters (ADR 0022/0024). Wallonia publishes `EAU/RES_HYDRO_WAL` (watercourse network) as a map service (https://geoservices.wallonie.be/arcgis/rest/services/EAU?f=json). **[UNVERIFIED]**: its EPSG:3857 WMS support and licence.

## 4. Integration notes for Leaflet in this codebase

- **XYZ / RESTful WMTS on a GoogleMapsCompatible set = plain `L.tileLayer`.** Leaflet's `template()` replaces any `{key}` in the URL with tile data or a layer option, anywhere in the string, query string included. It throws on an unknown key. Source: `node_modules/leaflet/dist/leaflet-src.js` (lines 171 to 190, `template`; line 12215, `getTileUrl`). So:
  - NGI: `https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png`, `minZoom: 7` (or `minNativeZoom`), `maxZoom: 17`.
  - Flanders (KVP): `https://geo.api.vlaanderen.be/OMWRGBMRVL/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=omwrgbmrvl&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`, plus `bounds` around Flanders so out-of-range 400s never happen.
  - UrbIS: `.../rest/Ortho/default/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/jpeg`. The literal colons are fine, but the URL must not contain braces other than Leaflet keys.
  - EOX: `.../s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`. Note the `{y}/{x}` order, as in WMTS (row, then column).
  - **No WMTS plugin** (e.g. leaflet-tilelayer-wmts) is needed for these. A plugin or Proj4Leaflet is only needed for services without a 3857 set (the Walloon WMTS), and the Walloon WMS avoids that.
- **WMS = `L.tileLayer.wms`** (react-leaflet `WMSTileLayer`). It sends `crs` (WMS 1.3) or `srs` from the map's CRS (EPSG:3857 by default), with default params `service=WMS&request=GetMap`, `format: 'image/jpeg'`, and `layers` required. Source: `leaflet-src.js` lines 12335 to 12400. For Wallonia: URL `https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer`, `layers: '0'`, `format: 'image/png'`, `transparent: true`, `version: '1.3.0'`. The WMS renders each tile on demand (`cache-control: private`), so it's slower than cached tiles. Be polite (SPW Art. 5 §1).
- **Layer switcher:** `L.control.layers` / react-leaflet `LayersControl` with `BaseLayer` and `Overlay` children. The app's style is Base UI wrappers (ADR 0020), so a custom switcher (e.g. a `Menu` or `ToggleGroup` choosing the base layer, kept in settings) may fit better than Leaflet's built-in control. That's a design decision, not researched here.
- **Phone:** the existing "layers button" is taken by the access layer. A base-map choice needs its own control or a menu entry (ADR 0026 layout).
- **Attribution:** each `TileLayer` passes its own `attribution`; Leaflet's attribution control collects it from the active layers (`leaflet-src.js` around line 5751). Strings must go in `src/ui/strings.ts` (ADR 0013). OSM's policy forbids hiding attribution "behind toggles".
- **Combining Belgian regions:** a "Belgian aerial" choice can stack Wallonia WMS (transparent outside Wallonia, verified), Flanders WMTS (with `bounds`) and optionally UrbIS. **[UNVERIFIED]**: how the seams look along the regional borders, and whether the Flemish PNG is transparent inside its tile range but outside Flanders.
- **Max zoom:** set `maxZoom` and `maxNativeZoom` per layer (NGI 17, Flanders 21, OTM 17). Switching to a layer with a lower max zoom while zoomed in needs `maxNativeZoom` so tiles upscale instead of disappearing.
- **CORS / HTTPS:** every tested endpoint is HTTPS and answered with `Access-Control-Allow-Origin` (`*` or an echoed origin). Plain `<img>` tiles don't need CORS unless `crossOrigin` is set. Note the EOX capabilities advertise `http://` ResourceURLs; use `https://` (tested OK).
- **Referer:** OSM and Waymarked Trails want a correct Referer. Next.js's default `Referrer-Policy` should be checked. **[UNVERIFIED]**: what the deployed app sends.
- **Offline / PWA:** OSM, OpenTopoMap, Esri and Waymarked Trails all forbid or discourage bulk or offline download. The service worker already never caches tiles (ADR 0023), so nothing changes.
- **Dependency boundary:** none of the recommended layers needs a new package. Leaflet and react-leaflet are already allowlisted (`src/ui/components/boundary.test.ts`). Proj4Leaflet or a WMTS plugin would need a deliberate allowlist change (ADR 0020). Not needed.
- **Testing (ADR 0019):** `serveOffline` only fulfils `*.tile.opentopomap.org` and aborts everything else into `blocked`, which several specs assert is empty. Adding layers means:
  - generalising the tile branch to a list of known tile hosts and path patterns (Flemish KVP query, WMS `GetMap` with BBOX, NGI and UrbIS REST), served from the same `e2e/fixtures/tile.png` (or a JPEG fixture);
  - recording the requested layer or host so tests can assert a switch loaded the new layer;
  - updating `mapConfig.test.ts` if `baseLayer` becomes a list. Tests that only use the default layer are unaffected while OpenTopoMap stays default.
- **`npm run check:*`-style live check:** a manual script could HEAD one tile per layer to catch URL drift. That's optional, never in CI (ADR 0019).

## 5. Recommendation inputs (not a decision)

1. **Belgian aerial imagery**: Wallonia SPW `ORTHO_LAST` (WMS, EPSG:3857), plus Flanders `OMWRGBMRVL` (WMTS `GoogleMapsVL`), optionally UrbIS. Keyless, free, current (2026 / 2025), 25 cm, government source. Best for spotting weirs, banks and put-ins.
2. **NGI CartoWeb topo**: keyless 3857, Belgian national topo with official paths. CC BY-NC is fine under ADR 0002 (personal use) but must be revisited if that changes.
3. **Waymarked Trails hiking overlay** (or the SPW LiDAR hillshade overlay for Wallonia): keyless, helps plan hike legs and portages.

Outside Belgium (ADR 0004 says other regions should be a config change), only OpenTopoMap, OSM-based layers, EOX and the keyed providers are global. The Belgian layers should be per-region config.

## 6. Open questions and risks

- **Esri**: is keyless Leaflet use ever acceptable? The terms read as no. Treat as excluded unless Cedric accepts an ArcGIS account and key.
- **Walloon data licence** beyond the service conditions **[UNVERIFIED]**; the service conditions (2016) allow free use but say data conditions are in each dataset's metadata.
- **NGI attribution wording** for non-commercial use **[UNVERIFIED]**; NGI's "no derivative works" clause vs. drawing routes on top **[UNVERIFIED interpretation]**.
- **Flemish service caching:** `no-store` means no browser caching; heavier traffic per pan. No rate limit is published **[UNVERIFIED]**.
- **SPW WMS performance:** rendered per request, `cache-control: private`; may feel slow on the phone **[UNVERIFIED]**.
- **OpenTopoMap max zoom:** the app uses 17. A z18 tile also answered 200; whether it's real data or an upscale wasn't checked **[UNVERIFIED]**.
- **Max zoom for Waymarked Trails, CyclOSM, OpenSeaMap, Thunderforest, MapTiler and Mapbox** **[UNVERIFIED]**.
- **Availability:** all keyless services disclaim uptime (OSMF, OpenTopoMap, SPW Art. 6-7). A layer switcher also gives a fallback when one is down.
- **Privacy:** every tile request reveals the viewed area and IP to that provider (Digitaal Vlaanderen states it logs IP, user agent and referer). That's comparable to OpenTopoMap today, but each added provider is one more party.
