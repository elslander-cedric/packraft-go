# Official access points in Flanders and Brussels

Researched 2026-11-02. These are findings, **not decisions**, and not legal advice. **[UNVERIFIED]** marks what could not be confirmed in a primary source. Quotes are under 15 words. Facts are kept apart from inference, and inference is labelled.

Everything was read with light, read-only GETs, plus read-only POST counts to OpenStreetMap's Overpass API in section 6. No account, form or key was used. "Observed" means seen in a live service or a downloaded file on this date.

## Short answer

| Region | Equivalent of Wallonia's 92 aires? | Best usable source |
|---|---|---|
| **Flanders** | **Partly.** No dataset of paddling access points exists in any catalogue searched. The points are published, but only as PDFs, map boards and web pages | **VMM's four agreements and map boards:** 43 named points where getting in or out elsewhere is against the agreement. Widest list: De Vlaamse Waterweg's PDF of 172 rows, with no coordinates |
| **Brussels** | **No.** No official kayak landing, launch or portage point was found, and no catalogue has one. "None exists" holds for what is published, but only the Port can confirm it | **The Port's IENC charts** (CC0): they name 10 pontoons, mostly clubs', none marked for paddlers. Art. 30 of the port regulation lists three passenger landing places, each needing prior Capitainerie authorisation |

**Licence position.** Only the Brussels charts carry an open licence for this kind of data. No Flemish source has one for its points. De Vlaamse Waterweg's site terms forbid reuse without written permission. VMM's model licence covers "datasets", and whether its PDFs count is unclear. So a Flemish snapshot like the SPW one needs permission, as Wallonia did.

Getting a browser-ready source would take hand work too. Inference: about 2 to 4 hours for the 43 VMM points, and much more for the De Vlaamse Waterweg list, which gives only a municipality and a bank.

## Comparison of sources

"Reuse" says whether the source allows the app to ship the points as a built-in snapshot.

| Source | Owner | Contains | Points | Format, endpoint | Licence or terms | Reuse | Fresh | Put-in / take-out |
|---|---|---|---|---|---|---|---|---|
| [Infrastructure list](https://www.visuris.be/download/17b25fd3-9d05-4317-add5-c2fe0fd3b3e0?dl=0) | De Vlaamse Waterweg | Waterway, municipality, bank, type (jetty, slope, steps, quay) on navigable water | 172 rows, no coordinates | PDF, 4 pages | [Site terms](https://www.visuris.be/Voorwaarden?KL=nl): "zonder voorafgaande schriftelijke toestemming" is forbidden | **No,** without permission | PDF dated 2022-07-13 | Both; not split |
| [Boat ramps layer](https://www.visuris.be/pleziervaartopkaart) | De Vlaamse Waterweg | Name, waterway, address of trailer slipways | 69 observed | Undocumented ArcGIS-style query, `AWFRecreationalBoating/.../boatramppoints/0`, needs a bbox, CORS `*` | Same terms; automated fetching is banned | **No,** without permission | Not stated | Slipways; no paddling field |
| [Marinas layer](https://www.visuris.be/pleziervaartopkaart) | De Vlaamse Waterweg | Marinas with ISRS code | 117 observed | Same, `marinapoints/0` | Same | **No,** without permission | Sample record: 2017 | Not for paddlers |
| [RIS-index WFS](https://metadata.vlaanderen.be/srv/api/records/81924daa-51c3-473f-9fea-e65d8f0a7378) | De Vlaamse Waterweg | Waterway links and nodes only | 0 access points | INSPIRE WFS, ArcGIS Online | Modellicentie gratis hergebruik | Yes, but holds none | Metadata 2025-11-18 | None |
| [VMM agreements and boards](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement) | VMM with partners | Named points, rules, zones | 43: Dijle 11, Kleine Nete 9, Zenne 2, Waasland 21 | PDF, images. Waasland has one aerial photo page per pontoon | [Datasets](https://vmm.vlaanderen.be/disclaimer) are under the free model licence; PDFs not addressed | **Unclear,** ask | 2018 to 2023 | Both; each point serves both |
| [Peddelroutes](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute?type=kayak) | Sport Vlaanderen (on RouteYou) | 12 routes, 231 km, with street addresses of start points | 74 addresses, about 72 distinct | Web pages, RouteYou GPX links | [Disclaimer](https://www.sport.vlaanderen/disclaimer/) covers images only; no data licence | **No,** without permission | Pages current (a 2026 works note) | Mostly both |
| [TOV-POI layer](https://services6.arcgis.com/QBuWyjJyJZDKpVHF/arcgis/rest/services/TOV-POI/FeatureServer/0) | Unclear (see 3.4) | Jetties and marinas along the Dender and Schelde | 16 | Public ArcGIS feature service | None stated | **Unclear** | Item modified 2026 | Boating jetties, not paddling |
| [Ghent vaarkaart](https://stad.gent/nl/cultuur-vrije-tijd/wandelen-en-fietsen-gent/kano-en-kajak-gent-wat-je-moet-weten) | City of Ghent | City map of landing places | Not counted | PDF | Not checked | Not checked | 2022 by file name | Both |
| [Port IENC charts](https://port.brussels/en/navigation/electronic-navigational-charts) | Port of Brussels | Canal, locks, quays, named pontoons | 10 pontoon names, 0 for paddlers | S-57 ZIP, [metadata](https://geobru-geonetwork.irisnet.be/geonetwork/srv/api/records/f3f14e96-916b-11f1-ba29-010101010000) | **CC0** in the metadata | **Yes** | 2026-07 file, metadata 2026-08-06 | Not access points |
| [Port regulation art. 30](https://www.ejustice.just.fgov.be/cgi/article_body.pl?language=fr&caller=summary&pub_date=10-03-16&numac=2010031142) | Brussels Region | Passenger landing places | 3 | Legal text | Public law | Yes, as facts | 2010, consolidated to 2013 in the copy read | Both; needs authorisation |
| OpenStreetMap | Contributors, **not official** | Tagged points | Flanders 9 put-ins; Brussels 0 | Overpass | ODbL | Yes, with share-alike | Live | Mostly put-in |

## 1. De Vlaamse Waterweg

### What the Visuris map loads

Observed in the browser's network log on the [pleasure boating map](https://www.visuris.be/pleziervaartopkaart). It loads three base maps and exactly three overlays from an internal API (`awfolmaps/api/layers/getlayerconfigsbyids`):

| Layer | Name | Query endpoint on visuris.be |
|---|---|---|
| `boatramp` | Boothellingen | `/AWFRecreationalBoating/api/arcgis/rest/services/boatramppoints/0` |
| `marina` | Jachthavens | `/AWFRecreationalBoating/api/arcgis/rest/services/marinapoints/0` |
| `highspeedzone` | Snelvaartzones | `/AWFImportData/api/arcgis/rest/services/highspeedzone/0` |

**There is no paddling layer.** These aren't real ArcGIS servers: `.../services?f=json` gives 404, and `where=1=1` with no geometry gives zero features. With a bounding box over Flanders I got 69 boat ramps and 117 marinas. Neither has a paddling field, and a text search of all their attributes for kano, kajak, peddel and SUP found nothing. `access-control-allow-origin: *` was present.

This also answers an open item in [flanders.md](flanders.md): the high-speed zones sit behind the same kind of endpoint, under the same terms.

### The list of in- and uitstapplaatsen

The [paddling page](https://www.visuris.be/kano?KL=nl) says De Vlaamse Waterweg invests in safe places to get in and out, and links a list. It's a PDF titled "Infrastructuur voor door spierkracht voortbewogen kleine schepen", with the metadata title "Bijlage bij beleidsvisie", created 2022-07-13: [PDF](https://www.visuris.be/download/17b25fd3-9d05-4317-add5-c2fe0fd3b3e0?dl=0).

- **Columns:** waterway, municipality (sometimes with a landmark), bank, type.
- **Size:** 172 rows by script count.
- **Types:** steps 81, jetty 35, slope 32, jetty and steps 14, the rest mixed or other.
- **Locks:** 47 rows name a lock in the municipality column, usually as a pair, as in "Mol (sluis 2)" twice. Inference: these are the steps above and below the lock, so a paddler can carry around it. The list doesn't say so.
- **Coverage:** navigable water only, from the Westhoek to the Maas.
- **Missing:** coordinates, names, and whether a place is a put-in or a take-out. The legend also omits some codes used (`O`, `WO`, `ZO`).
- **How locatable** (inference): the lock rows can be placed from the lock's position, as can rows with a landmark. A row such as "IJzer, Diksmuide, RO" can't be placed without a site check or other sources.

It is not in the metadata catalogues. It's a 2022 snapshot and may have gaps since then **[UNVERIFIED]**.

### GIS and open data

- [RIS-index metadata](https://metadata.vlaanderen.be/srv/api/records/81924daa-51c3-473f-9fea-e65d8f0a7378): the abstract mentions objects such as "kaaien, bolders, steigers", under the Modellicentie gratis hergebruik. But the [INSPIRE WFS](https://dservices-eu1.arcgis.com/0BOxFMmSWQhAlNXX/arcgis/services/INSPIREWaterway/WFSServer?service=wfs&request=getcapabilities) serves only `WaterwayNode` and `WaterwayLink` (observed). The jetties aren't published in it.
- [De Vlaamse Waterweg's public ArcGIS Online services](https://services-eu1.arcgis.com/0BOxFMmSWQhAlNXX/arcgis/rest/services?f=json): 17 services, none about recreation or access. An ArcGIS Online search of the organisation for kano, kajak, peddel, steiger, instap, recreatie, jachthaven, helling and aanleg returned 0 items.
- [Trailerhellingen page](https://www.visuris.be/trailerhellingen): a table with an export control. Public and club slipways are both listed, and club ones need contact first. It doesn't mention paddlers. I did not try the export.

### Terms

[Visuris terms](https://www.visuris.be/Voorwaarden?KL=nl), undated, read today:

- Other use, publication or copying "zonder voorafgaande schriftelijke toestemming" is forbidden.
- Mirroring needs written permission.
- Automated collection is banned as "screen scraping".
- Data is protected, and no open licence is named.

Contact: `ris@vlaamsewaterweg.be` ([Visuris](https://www.visuris.be/databeheer)).

## 2. VMM

### Put-ins are not data

The catalogues hold nothing: see section 3.5. VMM publishes [16 documents](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement), all PDFs and images.

| Stretch | Points | Where they're named | Enough to locate? | Dated |
|---|---|---|---|---|
| **Dijle** | 11 | [VMM page](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kanovaren-op-de-dijle), [map image](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/bordkanokajakdijle.jpg). Addresses on the [route page](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute/route/5110146) | **Yes,** by hand: a numbered map on a topo base, name and address | Board "Laatst goedgekeurd 2018"; agreement PDF 2018-06 |
| **Kleine Nete** | 9 | [VMM page](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kanovaren-op-de-kleine-nete), [map image](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/bordkanokajaknete-enkel-kaart.jpg). Addresses on the [route page](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute/route/5109895) | **Yes,** by hand | Agreement PDF 2018; map PDF 2018-06 |
| **Zenne** | 2 | [Board](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/bordzenne.pdf/@@download/file), [route page](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute/route/12174358) | **Yes,** but the start is marked temporary | Board 2023-05; agreement 2023-10 |
| **Waasland** (Moervaart, Zuidlede, Stekene, Boven-Durme) | 21: nos. 1 to 20 and one marked `*` | [Annex 2](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/bijlage-2_overeenkomst-peddelroute.pdf/@@download/file): 18 pages, an address and an aerial photo per pontoon | **Yes,** the best of the four. One point has GPS (no. 5) | Annex 2020-02 |

Annex 1 of the Dijle and Kleine Nete agreements is referred to but isn't in the published PDFs (observed: one mention, no annex). The names come from the VMM pages and boards.

The boards are drawn on a topographic base whose rights weren't checked, so tracing them is a different act from noting a place. How far that matters is **[UNVERIFIED]**.

### These points can close

- **Zenne.** The [2023 agreement](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/convenant-kajak-zenne_2023-1.pdf/@@download/file) says it "eindigt op 31 december 2023". VMM still links it, and [Sport Vlaanderen](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute/route/12174358) still lists the route, with a ticket required and no descents from 1 April to 31 May. Whether it was renewed: **[UNVERIFIED]**. The pontoons are described as temporary and mobile.
- **Kleine Nete.** VRT reported an extended temporary ban on three stretches in the 2026 drought ([VRT, 9 July 2026](https://www.vrt.be/vrtnws/nl/2026/07/09/uitbreiding-vaarverbod-kleine-nete-kajakverhuurders-vrezen-annul/)). The article names no legal basis, and [VMM's page](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kanovaren-op-de-kleine-nete) says only that fragile stretches can close at low water. Whether it's still in force: **[UNVERIFIED]**.
- **All four.** Each agreement says permitted points can be withdrawn temporarily or permanently on revision or lapse. So a Flemish snapshot, like the SPW one, can go stale.

## 3. Sport Vlaanderen, tourism bodies and catalogues

### 3.1 Sport Vlaanderen

The [route list](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute?type=kayak) shows **12 routes, 230.8 km** (observed in the rendered page): Dijle, Zenne, Grote Nete, Demer, Durme (from Lokeren), Zuidlede, Stekense Vaart, Kleine Nete, Moervaart, Dessel | Herentals, Dessel | Turnhout, Mandel. This settles a [paddle-routes.md](paddle-routes.md) open item, as of today.

Each route page ends in a "Startplaatsen" list of street addresses, which only appears once the page has run its scripts: Dijle 11, Grote Nete 10, Kleine Nete 9, Dessel | Herentals 9, Dessel | Turnhout 8, Demer 7, Zuidlede 5, Mandel 5, Moervaart 4, Durme 3, Stekense Vaart 2, Zenne 1. That's 74 lines, about 72 distinct. Two give only a postcode and town, and the Zenne lists only its start. The list order isn't always route order. Some pages add a table of named points: the [Grote Nete](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute/route/14107827) has one, with 10 "in- en uitstapplaatsen".

**GPX.** A route page carries GPX links on `download.routeyou.com`, served to an anonymous visitor (observed on the Kleine Nete page). This answers part of a [data-sources.md](data-sources.md) open item. The links embed an authorisation token, so I did not call them, and I don't know whether a GPX holds the start points. The route data has no public export besides these.

**Terms.** The [disclaimer](https://www.sport.vlaanderen/disclaimer/) reserves photos, videos and graphics ("niet zonder toestemming") and says nothing on text or data. No licence was found. RouteYou's own terms were not read. [Peddelsport Vlaanderen](https://www.peddelsport.vlaanderen/waar-het-water-op/peddelroutes-ontdekken) has no separate list; its route contact is on that page.

### 3.2 Toerisme Vlaanderen

The [open data portal](https://linked.toerismevlaanderen.be/) and its [catalogue entries](https://www.vlaanderen.be/datavindplaats/catalogus/campings-via-poi-service-v2) cover lodging. No paddling dataset was found. The [walking network](https://www.vlaanderen.be/datavindplaats/catalogus/toeristisch-recreatief-wandelnetwerk-vlaanderen) is listed as not public. These come from search results; I did not query the portal's SPARQL endpoint.

### 3.3 Cities

**Ghent.** The [city's page](https://stad.gent/nl/cultuur-vrije-tijd/wandelen-en-fietsen-gent/kano-en-kajak-gent-wat-je-moet-weten) gives "10 Gentse vaarregels"; rule 6 says "In- of uitstappen doe je bij de voorziene aanmeerplaatsen", and a map shows them. The [map PDF](https://www.Stad.Gent/sites/default/files/media/documents/2022-0797%20SSV_Vaarkaart_A4_DEF_NEW.pdf) came up in search, but the address I tried returned 404, so its points were not counted. [Ghent's open data portal](https://data.stad.gent/) returned one unrelated dataset for kajak, kano, aanmeerplaats and steiger (observed).

**Antwerp.** The city's public layers include harbour rescue gear, fishing spots and bollards, with no paddling layer ([service](https://geodata.antwerpen.be/arcgissql/rest/services/P_Portal/portal_publiek13/MapServer)).

### 3.4 Provinces and regional bodies

Nothing official was found for paddling. Searches for "kanoaanlegsteiger", "peddelpunt", "kajakhaven" and "instapsteiger" with the provinces, Regionale Landschappen, Westtoer and Toerisme Leiestreek gave no list or map. That is weak evidence: these are search results. I did not open each province's geoloket.

The one hit: the [TOV-POI service](https://services6.arcgis.com/QBuWyjJyJZDKpVHF/arcgis/rest/services/TOV-POI/FeatureServer) has an "Aanlegsteiger" layer of 16 points (15 published) with name, address and position, in Dendermonde, Hamme, Aalst, Ninove and nearby. Category "Varen", no paddling field. The [item](https://www.arcgis.com/sharing/rest/content/items/a4867de44ea9428784377d258d90b21c?f=json) has no description or licence, and its owner's name points to the Province of Antwerp while the places are in East Flanders. Inference: a tourism map's working layer, not a publication.

### 3.5 Catalogues searched

| Catalogue | Terms | Result (observed) |
|---|---|---|
| [metadata.vlaanderen.be](https://metadata.vlaanderen.be/srv/dut/csw) (feeds Geopunt) | kano, kajak, peddel, instapplaats, jachthaven, trailerhelling | **0 each** |
| Same | aanlegsteiger, steiger, waterrecreatie | Topo maps, RIS-index, Watervlakken; no access points |
| [metadata.omgeving.vlaanderen.be](https://metadata.omgeving.vlaanderen.be/srv/dut/csw) | kano, kajak, instapplaats, aanlegsteiger | **0 each** |
| [data.europa.eu](https://data.europa.eu/api/hub/search/search?q=kajak&filter=dataset&limit=12), Belgium (harvests national portals; data.gov.be itself not queried) | kajak, peddel, instapplaats | Walloon stretch data and false matches; none for Flanders |
| [ArcGIS Online](https://www.arcgis.com/sharing/rest/search?f=json&q=kanosteiger), public items | kanosteiger, instapplaatsen, aanlegsteiger(s), kanoroute, peddelroute | Dutch layers and TOV-POI; none official for Flanders |

Inference: "no dataset" is firm for the regional catalogues, and softer for anything a province keeps unpublished.

## 4. Where an official point is a rule, and where it's a convenience

| Place | Status | Evidence |
|---|---|---|
| **Dijle** | **Rule** in the agreement | ["mogen enkel worden betreden en verlaten"](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/overeenkomst_kano_dijle_definitief_tw.pdf/@@download/file) at the provided points, except to pass a tree or in an emergency |
| **Kleine Nete** | **Rule** in the agreement | [Same rule](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/overeenkomst_kano-en_kajakvaart_kleine_nete_tw.pdf/@@download/file), and beds and banks may not be walked on. Private jetties must be open to everyone. The sandbank at the Heiken bridge may be used as a rest stop |
| **Waasland** | **Rule** in the agreement | [Same rule](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/overeenkomst_peddelroute-waasland_feb2020_def.pdf/@@download/file), with no tree or emergency exception written in that clause. Covers navigable water too. Puyenbroeck can't be used at set hours. Open-ended, reviewed yearly |
| **Zenne** | **Rule,** if the agreement still applies | Same rule, and all points must be public. The agreement's end date has passed **[UNVERIFIED]** whether it was renewed |
| **Navigable waterways** (De Vlaamse Waterweg) | **Convenience,** with two hard effects | No rule found limiting paddlers to the listed places. But [locks are closed to paddlers](https://www.visuris.be/download/e8d5a750-ea8d-43fb-b6ca-2462f5931db7?dl=0) (clause dated 30 September 2013), so you must leave the water there. And [a movable bridge isn't opened](https://www.visuris.be/kano?KL=nl) where in- and uitstapplaatsen are available |
| **Sport Vlaanderen routes outside the four** (Demer, Grote Nete, Mandel and the canals) | **Convenience** | No agreement or exit rule found. VMM's four are the only ones it lists. [flanders.md](flanders.md) found no right to land over private banks, so these points are the safe known places (inference) |
| **Ghent** | **City rule** | Rule 6 above. Its legal force is **[UNVERIFIED]**: a city page, and the police regulation wasn't read |

Who is bound by a VMM agreement is **[UNVERIFIED]**. [flanders.md](flanders.md) treats the agreements as management arrangements on top of art. 21 of the BVR, not permits. VMM's pages say that by using the infrastructure you accept the code of conduct, and the Zenne agreement has the municipalities issue GAS fines for breaching its limit on descents. Whether a lone paddler landing elsewhere breaks a rule with teeth wasn't established. Inference: a warning is defensible; a claim of "illegal" is not.

**Compared with Wallonia:** AGW art. 5 is a general legal rule in an order ([kayak-spw-access-points.md](kayak-spw-access-points.md)). The Flemish rule is per-stretch and contractual. So the app's "No official aire" warning wouldn't carry over: at most it would apply on four stretches (inference).

## 5. Brussels-Capital Region

### What was checked

| Source | Result |
|---|---|
| [Port leisure page](https://port.brussels/en/leisure/practical-information) | Lists clubs with addresses (CRBK, Canal It Up, sea scouts, BRYC). No pontoon, slipway, launch point or lock passage for paddlers |
| [Port interactive map](https://port.brussels/en/leisure/interactive-map) | Categories include Locks and Sports/nautical activities. Lists clubs, and the "Béco Pontoon" as a Waterbus stop. No landing or portage entry (observed in the rendered page) |
| [Port charts page](https://port.brussels/en/navigation/electronic-navigational-charts) | Three S-57 cells in `ENC_ROOT_20260708.zip`, scanned below |
| [geobru catalogue](https://geobru-geonetwork.irisnet.be/geonetwork/srv/fre/csw), FR, NL and EN | kayak, kajak, canoë, kano, ponton, steiger, embarcadère, aanlegsteiger, slipway, écluse, sluis, nautique, plaisance, pleziervaart: **0 each**. Port-related hits are the charts and two quay studies |
| [Port regulation](https://etaamb.openjustice.be/fr/arrete-du-gouvernement-de-la-region-de-bruxellescapit_n2010031142.html) (copy of the Moniteur text) | See below |
| [datastore.brussels](https://datastore.brussels/web/) | Its search returned a page shell, not results, so I relied on the geobru catalogue that feeds it **[UNVERIFIED]** that they match |

### The IENC charts

I downloaded the ZIP and read the three cells with a short ISO 8211 parser (object codes checked against [GDAL's S-57 tables](https://github.com/OSGeo/gdal/tree/master/ogr/ogrsf_frmts/s57/data)). Inference applies to anything beyond the names.

- **Licence:** the [metadata](https://geobru-geonetwork.irisnet.be/geonetwork/srv/api/records/f3f14e96-916b-11f1-ba29-010101010000) says CC0, "no conditions for reuse", and no limits on public access. This corrects [brussels.md](brussels.md), which has the licence as not stated.
- **Named pontoons, 10:** Pont de Laeken (Quai des Usines), UNB, RSNB, SNUB, SCAB, Cadets de Marine, Brussels by Water (Quai de Heembeek), Espace Béco, Cercle des Régates (Quai de Veeweyde), and "Ponton Visiteurs". Mostly clubs'. They're tagged as `berths` (17010) and an inland class GDAL's table doesn't list (17021). **[UNVERIFIED]** whether any is open to a passing paddler.
- **No match** in any object name for kano, kayak, canoe, slip, helling, cale, mise, embarc or aanleg.
- **Shoreline objects:** 569 `SLCONS` objects have `CATSLC` 11, across three overlapping charts. From my memory of S-57, 11 is landing steps and 12 and 13 are ramp and slipway **[UNVERIFIED]**. No object has 12 or 13. Inference: quay stairs and ladders, not launch points.
- **Small craft facilities:** 2 `SMCFAC` objects, with no name, category not decoded.
- **The Cercle des Régates pontoon** at Quai de Veeweyde is in the chart cell that covers Anderlecht. The Port lists a kayak club of that name in Anderlecht. That's the nearest thing to a paddling landing found (inference; the club's terms unread).

### The port regulation

- **Art. 30** ([official text](https://www.ejustice.just.fgov.be/cgi/article_body.pl?language=fr&caller=summary&pub_date=10-03-16&numac=2010031142)) lists the port's equipment for embarking and disembarking passengers: the Béco landing stage, the stairs at quai des Péniches by Citroën, and quai de Heembeek, plus any place the Capitainerie authorises. §2 opens them to all users, but §3 requires a prior authorisation request for any docking or mooring.
- **Art. 59 §1:** a boat may moor only at installations provided for it. Art. 4 §1 counts small craft as boats ([brussels.md](brussels.md)).
- **Locks:** the regulation has nothing on small craft passing them. No slipway article either.

Inference: on a strict reading, even a short stop at a quay may need the Capitainerie's say-so. Whether this is applied to a paddler carrying around a lock is **[UNVERIFIED]**.

### The locks

No published landing or portage point exists at Anderlecht or Molenbeek in anything read. One useful data point: on 1 May 2024 about fifty paddlers passed both locks under a "autorisation particulière" ([BX1](https://bx1.be/categories/news/une-cinquantaine-de-personnes-ont-traverse-les-ecluses-du-canal-en-kayak/)), the article calling them normally closed to them.

A search snippet mentions a Molenbeek hall with direct canal access for kayaks, agreed with the Port. I could not find or date the article **[UNVERIFIED]**.

### Can "none exists" be stated firmly?

**Firmly for published data:** the Port's leisure pages, map and charts, the regional catalogue and the regulation show none, on 2026-11-02. **Not firmly as a fact about the world:** clubs clearly launch, and the regulation lets the Capitainerie authorise other places. Its own list could exist unpublished. Only the Capitainerie can close this (contacts in [brussels.md](brussels.md)).

## 6. OpenStreetMap, for comparison only

**Not official.** Counts from Overpass, data to 2026-11-02 20:19 UTC, on relations 53134 (Flanders) and 54094 (Brussels).

| Tag | Flanders | Brussels |
|---|---|---|
| `canoe=put_in` | 9 | 0 |
| `canoe=*` (mostly on waterways) | 206 | 0 |
| `whitewater` put-in or egress | 1 | 0 |
| `leisure=slipway` | 128 | 0 |
| `portage=*` | 0 | 0 |
| `man_made=pier` with `canoe=*` | 5 | 0 |
| `seamark:type=small_craft_facility` | 16 | not counted |

The Brussels area was checked with a control query: it returns 18 canal ways, 4 lock gates, 27 piers and 1 marina, so the zeros are real. Nine put-ins is about a fifth of VMM's 43, and they may not be the same places. Inference: too sparse to stand in for an official list. [data-sources.md](data-sources.md) reached the same view for Belgium.

**ODbL.** [OpenStreetMap's terms](https://www.openstreetmap.org/copyright) ask for credit and say "you may distribute the result only under the same license". A built-in snapshot from OSM would be a derived database, so it would need the credit and ODbL terms on that data, separate from the rest of the app (inference, not legal advice). The app already ships OSM-derived stretch geometry, so this isn't new to the project.

## 7. Licence position

Facts:

- **Flemish right to reuse.** Flemish and local bodies must handle reuse requests for public information, commercial or not; they answer within 20 calendar days, 40 at most ([Digitaal Vlaanderen](https://www.vlaanderen.be/digitaal-vlaanderen/recht-op-hergebruik-van-overheidsinformatie)). Conditions must use a model licence unless justified. Exclusions include material where third parties hold the rights.
- **The model licence** allows reuse "voor elk rechtmatig doeleinde", with attribution ([version 1.0](https://www.vlaanderen.be/digitaal-vlaanderen/onze-diensten-en-platformen/open-data/voorwaarden-voor-het-hergebruik-van-overheidsinformatie/modellicentie-gratis-hergebruik)).
- **VMM** says its datasets are "onder de modellicentie voor gratis hergebruik" and asks for its site as the source ([disclaimer](https://vmm.vlaanderen.be/disclaimer)).
- **De Vlaamse Waterweg** forbids reuse of site data without written permission, as above.
- **Brussels charts:** CC0.

Inference:

- A place name and street address on a public agreement is thin copyright material. A compiled list can still be protected as a database, and tracing a map is riskier than noting facts. Not settled here.
- Whether a Flemish reuse request can override De Vlaamse Waterweg's site terms isn't clear; the terms and the right can both apply **[UNVERIFIED]**.
- The cleanest route is to ask, as with the SPW. Sending anything is Cedric's call. The three askers would be VMM (points of the four stretches), De Vlaamse Waterweg (`ris@vlaamsewaterweg.be`: the list with coordinates, which it presumably holds) and Sport Vlaanderen (`sportievevrijetijd@sport.vlaanderen`). The Port of Brussels would need a separate question about landing and portage.

## 8. What couldn't be verified

- **Zenne:** whether the agreement was renewed after 2023.
- **Kleine Nete:** the instrument behind the 2026 ban, and whether it's still on.
- **Binding force** of VMM agreements on an individual paddler.
- **GPX contents:** links not called, as they embed a token. RouteYou's terms unread.
- **Ghent map:** not retrieved, points not counted.
- **Provinces:** geoloketten not opened one by one; Toerisme Vlaanderen's SPARQL not queried; data.gov.be reached only through data.europa.eu.
- **Whether De Vlaamse Waterweg holds coordinates** for its list. Inference: it does, as it invests in these places.
- **Port pontoons:** public or club-only. Port terms not found; the site's footer links weren't fetched.
- **S-57 category meanings:** `CATSLC` 11 to 13 from memory; class 17021 and `CATSCF` 23 not decoded.
- **Molenbeek hall:** a snippet only.
- **Currency of the port regulation:** the copy read was consolidated to 2013, as in [brussels.md](brussels.md).

## 9. Existing notes this updated

Carried over on 2026-11-02:

- [brussels.md](brussels.md): the IENC licence is CC0, the art. 30 landing places, the charts' pontoons, and the 2024 lock passage.
- [data-sources.md](data-sources.md): the GPX question, Sport Vlaanderen's start addresses, the Visuris endpoints and their terms, and rows for access points and the Port's charts.
- [flanders.md](flanders.md): the Zenne end date, the Waasland agreement, the Dijle's 11 jetties, the 2026 Kleine Nete ban, and the high-speed zones. "No open geometry" for VMM stretches stands.
- [paddle-routes.md](paddle-routes.md): 12 routes today, and where a Flemish point is a rule.
