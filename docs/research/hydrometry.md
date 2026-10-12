# Walloon hydrometry: can packraft-go compute the daily kayak status?

Researched 2026-10-12. Every live test was a single request made that day. Not legal advice.

## TL;DR

- **Technically, yes.** `hydrometrie.wallonie.be` exposes a public, keyless **KISTERS KiWIS** web service that returns JSON with discharge (m³/s) at 5-minute, hourly and **72-hour moving mean** resolution. It sends `Access-Control-Allow-Origin: *`, so a static browser app can call it directly. No CORS proxy is needed.
- **All Annex 2 reference gauges were found with station IDs except "Wanlin" (Lesse).** Some names are ambiguous (two "Martelange" stations, for example).
- **No public flow forecast exists.** The AGW's "08:00 forecast" rule for maximum flow can't be reproduced. kayak.spw.wallonie.be itself appears to use the observed hourly flow at 08:00 plus the 72 h mean, updated at 08:15.
- **The licence is the blocker, not the technology.** The site's legal notice allows reproduction with attribution. It also says that, without written SPW agreement, you may not pass the data to third parties or publish it, and it bans commercial reuse without permission. Showing derived "open/closed" status publicly sits in a grey zone. **Recommendation: email the SPW for written permission before shipping.**

---

## 1. Which services exist

| Service | Status | Source |
|---|---|---|
| **hydrometrie.wallonie.be** (SPW "Hydrométrie Wallonie") | Live. A single portal that merged the former infocrue (Direction de la Gestion hydrologique, WACONDAH network) and AQUALIM (non-navigable watercourses) sites. Over 400 stations. | https://hydrometrie.wallonie.be/home.html ; https://www.interregeurope.eu/good-practices/hydrometry-flood-information-in-wallonia-real-time-geodata-for-crisis-management ; https://www.rtbf.be/article/la-wallonie-fusionne-ses-outils-de-surveillance-hydrologique-un-an-apres-les-inondations-11025538 |
| **KiWIS API** behind it: `https://hydrometrie.wallonie.be/services/KiWIS/KiWIS` | Live, anonymous. Tested (see section 3). The SPW publishes no documentation. The endpoint is known from ULiège's `wolfhece` client. | https://wolf.hece.uliege.be/_modules/wolfhece/hydrometry/kiwis.html ; https://wolf.hece.uliege.be/hydrometry/example_hydrometry.html |
| Token endpoint `https://hydrometrie.wallonie.be/services/auth/token/` | Exists for authenticated users. Not needed for public data. | https://wolf.hece.uliege.be/_modules/wolfhece/hydrometry/kiwis.html |
| Manual downloads (form, data sent by email, maximum 250,000 values per request) | Live. Not usable from an app. | https://hydrometrie.wallonie.be/home/services/telechargements-des-donnees.html |
| AQUALIM station layer (ArcGIS MapServer, locations only) | Live. Gives station positions, no time series. | https://geoservices.wallonie.be/arcgis/rest/services/EAU/RES_LIMNI_DGARNE/MapServer/layers |
| aqualim.environnement.wallonie.be (legacy) | Gave no response on 2026-10-12. Merged into hydrometrie.wallonie.be. | https://www.rtbf.be/article/la-wallonie-fusionne-ses-outils-de-surveillance-hydrologique-un-an-apres-les-inondations-11025538 |
| voies-hydrauliques.wallonie.be (SETHY, legacy) | Returns a 301 redirect to infrastructures.wallonie.be ("naviguer en Wallonie"). The hydro pages are gone. | `curl -I http://voies-hydrauliques.wallonie.be/opencms/opencms/fr/hydro/` returned 301 to https://infrastructures.wallonie.be/home/nos-thematiques/voies-deau/naviguer-en-wallonie.html |
| Open-data portals (opendata.wallonie.be, data.gov.be, Metawal) | **No hydrometry time-series dataset found [UNVERIFIED]**: searched, not exhaustive. | Web searches on 2026-10-12 found nothing relevant. |
| SOS / OGC SensorThings | **None found [UNVERIFIED]**. | n/a |

## 2. What KiWIS provides

Station list (501 entries, including river and basin pseudo-stations), with latitude and longitude:
`getStationList`. Each gauge has dozens of time series ("ts"). The relevant ones, using Stavelot (station_no `6732`) as the example:

| ts_name | Meaning | Example ts_id (Stavelot) | Resolution / latency observed |
|---|---|---|---|
| `05-Debit.Complet` | Raw discharge, m³/s | 299147010 | **5 min**. Last value at 11:30 local, queried at about 11:44, so about 15 min latency. |
| `10-Debit.1h.Moyen` | Hourly mean discharge | 299124010 | Hourly. Last value 11:00. |
| `34-Debit.3jMob.Moyen` | **3-day (72 h) moving mean discharge** | 299146010 | **One value per day**, stamped 01:00 local. Today's value was 5.038 m³/s. |
| `32-Debit.24hMob.Moyen` | 24 h moving mean | 299131010 | Hourly. |
| `990-Debit.Tendance` | Trend flag (values 0 = stable), **not a forecast** | 299149010 | 5 min. |
| `10-Hauteur.1h.Moyen` and similar | Water level (m) | 243737010 | Hourly. |

- **History:** decades of data. Stavelot discharge starts in 1998, Membre in 1929, Gendron in 1968. Source: `coverage` fields in the getTimeseriesList output.
- **Quality codes:** values come with a quality code. The legal notice says raw data (code 200) isn't operator-validated and validated data has a code below 200. Source: https://hydrometrie.wallonie.be/mentions-legales.html
- **Forecasts:** none in KiWIS. A `ts_name=*Prev*` search returned zero series, and the hourly series has no future timestamps. The flood-forecast page describes the internal tool "Augure" and colour-coded basin alerts, but **no public flow-forecast data**. Source: https://hydrometrie.wallonie.be/home/en-savoir-plus/prevision-des-crues.html
- **How kayak.spw.wallonie.be decides:** its page shows "Débit horaire (8h)", the 72 h flow, the minimum and maximum, and the reference limnigraph. It says it updates automatically at 8:15 with new measurements, and it also supports manual overrides. Source: https://kayak.spw.wallonie.be/ . The forecast rule is therefore probably applied manually, or not at all. **[UNVERIFIED]**: the SPW's exact algorithm.

### AGW rules that need flow data (Art. 6)
Source: https://wallex.wallonie.be/files/pdfs/5/6718_Arr%C3%AAt%C3%A9_du_Gouvernement_wallon_r%C3%A9glementant_la_circulation_sur_et_dans_les_cours_d%27eau_01-09-2021-.pdf

- §2: **closed for the day** if the 72 h mean flow is below the Annex 2 minimum.
- §3: **closed for the day** if the 08:00 forecast predicts the maximum will be exceeded during permitted hours, **or** if the observed hourly mean is above the maximum.
- §4: inflatables for 4 to 10 people are allowed only if both the 72 h mean and the hourly mean are above 5 times the minimum.
- §1: the status is published on the SPW kayak website and a phone line. Art. 8: ministers can restrict or allow exceptions ad hoc. Data can't capture these exceptions.

## 3. Access: tested requests

Base URL: `https://hydrometrie.wallonie.be/services/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json&...`

Working requests (each made once):

1. Station list:
   `...&request=getStationList&returnfields=station_no,station_name,station_id,river_name,station_latitude,station_longitude`
2. Time series of a station:
   `...&request=getTimeseriesList&station_no=6732&returnfields=ts_id,ts_name,parametertype_name,stationparameter_name,ts_unitsymbol,coverage`
   This also accepts several stations and a ts_name filter, for example `station_no=6732,5953,9434&ts_name=34-Debit.3jMob.Moyen,10-Debit.1h.Moyen`.
3. Values for several series at once:
   `...&request=getTimeseriesValues&ts_id=299146010,299147010&period=P1D&returnfields=Timestamp,Value,Quality%20Code`
   You can also use `from=...&to=...` with ISO timestamps.
   The response is a JSON array of `{ts_id, rows, columns, data:[[timestamp, value, quality], ...]}`.

Response headers seen with `Origin: https://packraft-go.vercel.app`:
```
HTTP/1.1 200
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept
Content-Type: application/json;charset=UTF-8
Cache-Control: max-age=300, stale-while-revalidate=240, stale-if-error=300
X-spw-user: public
```
- **No API key is needed.** The server reports `X-spw-user: public`.
- **CORS is allowed for any origin**, so a browser can call it directly.
- Responses are cached for 5 minutes upstream.
- **Rate limits:** none documented. **[UNVERIFIED]**: during the July 2021 floods the site was overloaded (https://www.rtbf.be/article/le-site-internet-dinformation-sur-la-situation-des-cours-deaux-wallons-est-sature-noye-de-demandes-11307745). The app should keep calls minimal: one batched call per view, cached.
- The service is undocumented by the SPW and could change without notice.

## 4. Licence and terms

Source: https://hydrometrie.wallonie.be/mentions-legales.html. No named licence, and no CC BY.

- Reproduction is allowed without prior agreement: "La reproduction des données … est autorisée sans accord préalable."
- **Attribution is required:** "Sources des données : Service public de Wallonie" (or "SPW"), with a link to hydrometrie.wallonie.be where possible.
- **Redistribution is restricted:** "Le SPW est seul habilité à distribuer les données". Without the SPW's prior written agreement, users may not pass the data to third parties or publish it.
- **Commercial use** of the data needs prior authorisation.
- Embedding all or part of the site in another site needs written authorisation. Plain links are free.
- **No guarantee:** the data has no legal value and raw data may contain significant errors. The SPW isn't liable for damage, delays or interruptions.
- The SPW geodata general conditions (https://geoportail.wallonie.be/files/documents/ConditionsSPW/DataSPW-CGA.pdf) and the Walloon open-data decree (https://wallex.wallonie.be/files/pdfs/0/11261_D%c3%a9cret_relatif_%c3%a0_la_r%c3%a9utilisation_des_informations_du_secteur_public_et_visant_%c3%a0_l'%c3%a9tablissement_d'une_politique_de_donn%c3%a9es_ouvertes_(%c2%ab_Open_Data_%c2%bb)_01-09-2017-18-02-2023.pdf) apply to geoportal data. **[UNVERIFIED]** whether either covers the KiWIS time series.

**Interpretation (not legal advice):** having each visitor's browser fetch directly from the SPW means packraft-go never stores or rehosts the data. That is arguably the user consulting the SPW service. But showing flows, or a status derived from them, publicly on packraft-go is close to "diffuser au public" (publishing to the public). The free, non-commercial nature of the app helps but doesn't remove the clause. **Get written permission from the SPW** (Direction de la Gestion hydrologique, via https://hydrometrie.wallonie.be/contact.html). This could go in the same email as the kayak-feed request to info.kayak@spw.wallonie.be. Sending it is Cedric's call.

## 5. Gauge coverage: AGW Annex 2 mapped to KiWIS

**Annex 2 source:** linked from the Wallex act page https://wallex.wallonie.be/contents/acts/6/6718.html. The PDFs are:
- Annex 1: https://wallex.wallonie.be/files/medias/0/6393.pdf
- **Annex 2: https://wallex.wallonie.be/files/medias/0/6394.pdf** (2 pages, extracted below)
- Annex 3: https://wallex.wallonie.be/files/medias/0/6395.pdf

The consolidated act text (in force since 2021-09-01, amended by the AGW of 8 July 2021) shows no amendment to Annex 2. **[UNVERIFIED]**: whether kayak.spw.wallonie.be uses updated thresholds.

Column notes:
- **station_no** is the code the site uses. It's what the API takes in `station_no=`.
- **72 h ts_id** and **1 h ts_id** are the `34-Debit.3jMob.Moyen` and `10-Debit.1h.Moyen` series.
- An empty minimum means the stretch only has a maximum.

| Sub-basin | Stretch (short) | Gauge (Annex 2) | Min m³/s | Max m³/s | station_no | 72 h ts_id | 1 h ts_id |
|---|---|---|---|---|---|---|---|
| Amblève | Amblève, Warche confluence to Cheneux bridge | Stavelot | 1.0 | 21 | 6732 | 299146010 | 299124010 |
| Amblève | Amblève below Lorcé dam | Martinrive | 2.5 | 44 | 6621 | 298930010 | 298908010 |
| Amblève | Warche below Robertville dam | Malmedy | | 8.9 | 6933 | 299434010 | 299412010 |
| Amblève | Salm below Vielsalm dam | Trois-Ponts | | 9.7 | 6832 | 299362010 | 299340010 |
| Lesse | Lesse, Barbouillons bridge (Daverdisse) to Chanly | Daverdisse | | 14 | 8341 | 301366010 | 301344010 |
| Lesse | Lesse, Han-sur-Lesse dam to 100 m above Houyet bridge | Wanlin | | 47 | **not found** | | |
| Lesse | Lesse, Houyet to Gendron | Gendron | 2.0 | 52 | 8221 | 301222010 | 301200010 |
| Lesse | Lesse, Gendron to Pont-à-Lesse | Gendron | 1.5 | 52 | 8221 | (same) | (same) |
| Lesse | Lesse below Pont-à-Lesse | Gendron | 1.5 | 52 | 8221 | (same) | (same) |
| Lesse | Lhomme below Mirwart | Jemelle | | 11 | 8527 | 301438010 | 301416010 |
| Meuse amont | Houille below Patignies | Gedinne | | 3.8 | L6400 (AQUALIM) | 278574010 | 278578010 |
| Meuse amont | Viroin | Treignes | 1.6 | 23 | 9021 | 301726010 | 301704010 |
| Moselle | Sûre below Bodange access ramp | Martelange | | 9.9 | L5610 (Sûre, has Q) or 9960 (no river name) | 272794010 (L5610) | 272798010 (L5610) |
| Moselle | Our below Auel | Reuland | | 17 | 9914 (Our). Not L6080, which is on the Ulf. | 303022010 | 303000010 |
| Ourthe | Ourthe, Nisramont to Maboge bridge | Nisramont | 3.0 | 31 | 5991 | 298354010 | 298332010 |
| Ourthe | Ourthe, Maboge to Barvaux mobile dam | **Durbuy** | 1.9 | 50 | 5953 | 298138010 | 298116010 |
| Ourthe | Ourthe below Barvaux dam | Tabreux | 2.5 | 65 | 5921 | 297994010 | 297972010 |
| Ourthe | Ourthe orientale below Houffalize | Houffalize | | 8.8 | L5930 | 274749010 | 274753010 |
| Ourthe | Ourthe occidentale below Prelle bridge | Amberloup | | 6 | L6290 | 277639010 | 277643010 |
| Ourthe | Aisne below Estinée confluence (Fanzel) | Erezée | | 4.4 | L6690 | 280699010 | 280703010 |
| Semois | Semois, Tintigny to Vierre plant (Chiny) | Tintigny | | 17 | 9561 | 302734010 | 302712010 |
| Semois | Semois, Vierre plant to Martué | Chiny | 1.5 | 31 | 9541 | 302662010 | 302640010 |
| Semois | Semois, Martué to Chassepierre bridge | Chiny | 1.5 | 31 | 9541 | (same) | (same) |
| Semois | Semois, Chassepierre bridge to Deleau mill | **Membre** | 2.2 | 50 | 9434 "MEMBRE Pont" | 302446010 | 302424010 |
| Semois | Semois below Deleau mill | Membre | 2.2 | 50 | 9434 | (same) | (same) |
| Semois | Vierre, Martilly to Suxy–Chiny road bridge | Martilly | | 8.6 | L7130 | 284439010 | 284443010 |

Sources for the table:
- Thresholds: Annex 2 PDF above.
- IDs: KiWIS `getStationList` and `getTimeseriesList` responses on 2026-10-12. The ts_ids are internal KiWIS numbers and could change, so look them up by station_no and ts_name at build time or at runtime.

Notes and gaps:
- **Wanlin (Lesse) has no station of that name.** There is an AQUALIM "Wanlin" (L7190), but it's on the Biran, a different river. Lesse candidates between Han and Houyet:
  - Hérock L6610 has Q.
  - Han-sur-Lesse L8930 has Q only until 2026-08-23.
  - Houyet 8231 has water level only.
  - **[UNVERIFIED]** which gauge the SPW now uses. Ask the SPW, or read the "Liminigraphe" field on kayak.spw.wallonie.be.
- **Martelange is ambiguous.** L5610 (AQUALIM, Sûre, has 72 h and 1 h Q) and 9960 (no river name). **[UNVERIFIED]** which one is the reference. L5610 seems likely.
- **Membre** has two stations: "MEMBRE Pont" 9434, which has Q, and "MEMBRE Amont" 9435, which only has water level. Use 9434. **[UNVERIFIED]** that it's the reference.
- **Gedinne:** L6400 (AQUALIM, Houille) has Q. FELENNE 8661 is further downstream on the Houille. Annex 2 names Gedinne, so use L6400.

## 6. Feasibility verdict

**Data and tech: feasible for about 25 of the 26 stretches.** The license and the forecast rule are the gaps.

What a static browser app **can** do from public data:
- Rule §2 (minimum): read `34-Debit.3jMob.Moyen`, the daily 72 h mean, and compare it with the Annex 2 minimum. This is exact.
- Rule §3, second bullet (maximum): read `10-Debit.1h.Moyen` at 08:00 local, which matches what kayak.spw.wallonie.be shows. Optionally, also read the latest hour.
- Rule §4 (inflatables): the same two series, compared with 5 times the minimum.
- Combine with Annex 1 seasons, hours and fishing-opening days. Those are encoded statically per ADR 0012.

What's **missing**:
1. **The 08:00 maximum-flow forecast.** It isn't public. Use "observed hourly at 08:00 > max" as an approximation, and label it clearly.
2. **Ad hoc ministerial restrictions and exceptions (Art. 8) and manual overrides** on kayak.spw.wallonie.be. Data can't capture these, so the app must always link to kayak.spw.wallonie.be as the authoritative source and show a disclaimer.
3. **The Wanlin gauge mapping** (and to a lesser extent Martelange and Membre) needs confirming.
4. **The licence.** Written SPW permission is needed for public display. Attribution is mandatory either way.
5. **Stability.** KiWIS isn't documented as a public API. Plan for failure and fall back to "unknown, check kayak.spw.wallonie.be".

**No CORS proxy is needed** (`Access-Control-Allow-Origin: *`).

### Minimal approach
1. A static JSON in the repo, built from Annex 2, holding:
   - stretch ID
   - gauge `station_no`
   - min and max
   - the Annex 1 category, for seasons and hours
2. At runtime, one batched `getTimeseriesList` call (all relevant station_nos, with `ts_name=34-Debit.3jMob.Moyen,10-Debit.1h.Moyen`) resolves the ts_ids. You could hard-code them instead, but that's more brittle.
3. One batched `getTimeseriesValues` call with all ts_ids and `from=<today>T00:00` gives the latest daily 72 h mean and the hourly values up to now.
4. A pure function `statusFor(stretch, date, flows)` returns open, closed-low, closed-high, closed-season, closed-hours or unknown.
   - Use "unknown" when data is stale, for example when the 72 h value isn't today's, or the quality code is suspicious.
   - Show "indicative; official status at kayak.spw.wallonie.be" and the attribution "Sources des données : Service public de Wallonie", linked to hydrometrie.wallonie.be.
5. Cache in memory or localStorage for about 15 minutes. That's 2 requests per visit, no backend, and fits ADR 0011/0012's static, browser-only model.
