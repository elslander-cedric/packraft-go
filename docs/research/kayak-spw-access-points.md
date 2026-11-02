# kayak.spw.wallonie.be: official access points and today's access status, compared with packraft-go

Researched 2026-11-01, from about 20:50 to 21:30 Brussels time. SPW figures are the ones served that evening (`datmes` 20261101). Not legal advice. **[UNVERIFIED]** marks what could not be confirmed. Observed facts and inference are kept apart: inference is labelled.

Requests were light, read-only GETs: no sign-in and no forms.

## Short answer

**Why the official access points aren't on the map.** The app has no aire data at all, by decision. ADR 0023 says official aire locations come only from your own marks (`docs/adr/0023-personal-access-points-and-mobile-pwa.md:18`, `src/core/aire.ts:4`), because the Walloon aire dataset is restricted. The earlier research also said the SPW site had no public JSON endpoint and no public kayak layer (`docs/research/data-sources.md`). That part is now out of date: the site reads 92 aires from a public ArcGIS map service that needs no key and allows any origin. The data can be reached. The blocker is permission, not technology: the dataset's terms forbid redistribution or web publication without the SPW's prior written agreement.

**Why access looks wrong.** The app's calendar rules match the law, and its thresholds match the SPW's. The main gap is that the app computes status from the AGW calendar plus flows, while the official status also carries decisions the app can't see. Today:

- **The SPW shows 17 of 21 stretches closed and 4 open.**
- **All 11 of the SPW's category 1.C stretches are closed by a ministerial order for severe low water.** The app can't represent that. For these stretches it can only say open, unknown or closed for high flow.
- **5 more stretches are closed by hand** (Ourthe 1, 2 and 3, Viroin, Amblève 3), with the automatic update off. The app can't see these either.
- **On the Semois, the app applies the wrong gauge for the SPW's real split.** Chassepierre to Linglé is closed by the SPW but open in the app.
- **The Lesse from Han to Houyet is permanently "unknown" in the app,** because the gauge question was never answered. The SPW uses Hérock.
- **KiWIS was down throughout this research** (503s and timeouts), and while it's down the app shows every Walloon stretch as unknown. The user may have seen this too **[UNVERIFIED]**.

## 1. What the SPW site publishes

### The app

- `https://kayak.spw.wallonie.be/public/home` is an AngularJS shell (footer "Version 2.2.0") with the SPW Geoviewer map in an iframe (`/public/geoviewer.jsp`). The page itself holds no data.
- Layers on the map: Tronçon, Aire, Plan d'eau, Objet particulier, Incident (`home.html`, "Couches à afficher"; `mapController.$scope.layers` in `/resources/js/pages/map.js`).
- Available in FR, NL, EN and DE. Contact: `info.kayak@spw.wallonie.be`, phone +32 81 33 63 08 (`/rest/services/contact/`). Run by the Direction des Cours d'Eau non navigables.

### The endpoints

Found with the browser's network log and in `map.js`, `widgets.json` and `catalog.json`.

| Endpoint | Gives | Format | Auth | CORS for a browser app |
|---|---|---|---|---|
| `kayak.spw.wallonie.be/rest/services/troncons/` | 21 stretches: status, reason, gauge, 8:00 flow, 72 h flow, min, max, texts in 4 languages | JSON, 515 KB | None | **No.** No `Access-Control-Allow-Origin` on the GET; `OPTIONS` gives 403 |
| `.../rest/services/troncon/{nomtro}` | One stretch plus a base64 photo | JSON | None | Not tested; same host |
| `.../rest/services/embarq/{numemb}` | One aire plus base64 photos | JSON | None | **No** (no CORS header on the GET) |
| `.../rest/services/planeau/{id}`, `/news/`, `/faqs/`, `/pages/{name}`, `/contact/` | Plans d'eau, news, FAQ, static pages, contact | JSON | None | Not tested; same host |
| `geoservices3.wallonie.be/arcgis/rest/services/APP_KAYAK/PKAYAK/MapServer` | ArcGIS 11.5 map service, Query enabled, GeoJSON supported, 2000 records per request, copyright "SPW" | JSON, GeoJSON, PBF | None | **Yes.** It echoes any `Origin` tested (packraft-go.vercel.app, localhost:3000, example.org) with `allow-credentials: true` |

Layers of the map service, queried with `where=1=1&outFields=*&outSR=4326&f=geojson`:

| Id | Layer | Count | Fields of interest |
|---|---|---|---|
| 0 | Incidents | 3 | `nomtro`, `commen` (4 languages), `datcre`, `datmod`, `datexp` |
| 1 | Objets particuliers | 96 | Dams, drossages, impassable points, rocks, low bridges (`codico`, `nomofr`) |
| 2 | Plans d'eau | 13 | Name, icons |
| 3 | **Aires** | **92** | `numemb`, `nomtro`, `nomair` (4 languages), `typemb`, `divers`, position, `datmod` |
| 5, 6 | Tronçons (two scale ranges, same data) | 21 each | `nomtro`, `stapub`, `justif` (4 languages), `adrtro` (4 languages), line |
| 8 | Réseau hydro | Not queried | `categ` |

Layer 5 with `outFields=nomtro,stapub&returnGeometry=false&f=json` is 1.3 KB. Its `stapub` and `justif` matched `/rest/services/troncons/` for all 21 stretches. This layer has no flows; those are only in the REST endpoint, which has no CORS.

### Access points

- 92 aires on all 21 stretches: 53 in and out (`ED`), 22 in (`E`), 15 out (`D`), 2 coded `NA`. Those 2 are described in their text as in-and-out, so `NA` is not "no aire" (#66 Vresse, #81 Sous le Nawée).
- Sample: `numemb` 16, Cugnon camping Saint-Remacle, `SEMOIS4-5`, `ED`, left bank, at 5.20387, 49.80789 (WGS84).
- **Freshness:** 86 of 92 were last changed in 2016; the newest is 2026-08-28 (Plopsa at Coo). Created 2005 to 2016. There's no feed or version field.
- The site also shows Objets particuliers and Incidents, which the app has none of.

### Status

Status codes come from `home.html` and its legend:

| `stapub` | Meaning |
|---|---|
| 0 | Forbidden, water too low (or the reason in `justif`) |
| 1 | Kayaks allowed |
| 2 | Kayaks may soon be forbidden |
| 3 | Forbidden, water too high |
| 4 | Forbidden, 1.C out of season (16 March to 30 September) |
| 5 | Kayaks and rafts allowed |

- **Update time:** the FAQ says 8:20 each morning, and the site's dialog says 8:15 for the new measurements.
- **Manual override.** The site has a stretch alert form for logged-in managers: `POST /rest/services/troncon-alerte` sets status, a reason and `mesnec`. Inference: `mesnec` `O` means automatic and `N` means manual, because the form's checkbox reads "Automatique : mise à jour à 8h15". All stretches with `mesnec=N` today have blank figures (`debitj` null, `debitm` 0.0, time 08:15). Treat these as placeholders, not measurements.
- **The site isn't always tidy.** `LESSE6-7` still carries a Covid-19 comment, and the News page's latest item is from 2020. The site's status is fresh; its free text may not be.

### Terms and open data

- **No legal notice on the site.** None was found in the home page. Metawal's application record says the app's legal notices apply and that its contents are protected by copyright (record `c94141c9-4422-4858-9274-e4b08dddc462`).
- **The aire dataset** is `634edbef-a925-41f4-9de1-fcac6a109361`, "Kayak - Aires et circulation en Région wallonne". Access is restricted to public bodies, their contractors and non-profit research (CPA type D1). Last revised 2014-06-01. Metawal lists Shapefile and FGDB, and no web service.
- **The SPW's general terms** (CGU v1.1, 2016): without prior written agreement, a user can't redistribute the data or publish it through a web service. Static publication such as a map image is allowed, with the credit "Sources des données : Service public de Wallonie" or "SPW" ([PDF](https://geoportail.wallonie.be/files/documents/ConditionsSPW/DataSPW-CGU.pdf)).
- **The web services terms** (v1.1, 2016): free to use, no disproportionate calling (art. 5 §1), and copying data must respect the data's licence (art. 5 §2). Data is indicative, and formats may change without notice (art. 6) ([PDF](https://geoportail.wallonie.be/files/documents/ConditionsSPW/LicServicesSPW.pdf)).
- **The `PKAYAK` service has no Metawal record of its own** in a search for "kayak" (8 records, none of them this service). It's public but uncatalogued.
- **Open data:** ODWB has `circulation-sur-les-cours-deau-en-wallonie`, CC BY, publisher SPW ARNE. Its description says it's no longer maintained and points to the kayak site. The records API returned 0 rows, though the metadata says 21. No aires there.
- **WalOnMap:** not checked directly. The Metawal search shows no public kayak layer **[UNVERIFIED]**.
- ADR 0022 records that the SPW had no objection to live flows and a computed status. ADR 0023 says that agreement doesn't cover the aire dataset.

## 2. How the SPW decides, and what the law says

The consolidated AGW of 19 March 2009 on Wallex (in force from 1 September 2021, no end date, amended only by the AGW of 8 July 2021) was read on 2026-11-01.

- **Art. 3:** only Annex 1 waters.
- **Art. 4:** seasons, fishing days and hours. `src/core/agw.ts` matches this text exactly.
- **Art. 5:** get in and out only at designated aires.
- **Art. 6 §1:** the administration sets the periods by flow, and publishes them on its kayak site and a phone line.
- **Art. 6 §2:** closed if the 72 h mean is below the Annex 2 minimum.
- **Art. 6 §3:** closed if the 08:00 forecast or the observed hourly mean is above the maximum.
- **Art. 6 §4:** inflatables for 4 to 10 people need both flows above 5 times the minimum. Today's `stapub` values fit this: Amblève 1 is 1 (kayaks) with a 72 h mean of 4.069, below 5 × 1.0.
- **Art. 8 §1:** the minister can temporarily ban or restrict circulation, for nature conservation or river management. **So a ministerial order overrides art. 4 and art. 6.**

Past orders using art. 8: 6 August 2021, Ourthe and Amblève after the floods, until 31 October 2021 ([Moniteur copy](https://etaamb.openjustice.be/fr/arrete-ministeriel-du-06-aout-2021_n2021032334.html)); and, from search results only (not read), 29 July 2021 on non-navigable waters ([copy](https://etaamb.openjustice.be/fr/arrete-ministeriel-du-29-juillet-2021_n2021032209.html)) and 26 February 2024 on the Semois, repealed on 2 April 2024.

### The 2026 drought

- `justif` on all 11 `typtro=2` (Annex 1.C) stretches: circulation is "suspendue par arrêté ministériel, jusqu'à nouvel ordre", because of severe low water.
- Official drought updates ([wallonie.be feed](https://wallonie.be/fr/actualites/quel-est-letat-de-la-secheresse-en-wallonie), CORTEX press releases of 2026-09-22, 10-01 and 10-12):
  - July to September: all stretches closed.
  - 1 and 12 October: kayaking is banned until further notice by a ministerial order, and all derogations are suspended.
  - The latest update found is 12 October.
- **The two official sources don't say the same thing.** The October releases name stretches open all year (*tronçons ouverts à l'année*); the kayak site names Annex 1.C, and today it has 4 all-year stretches open. Inference: the site is more specific and fresher, so the order was probably narrowed or is worded for 1.C. **[UNVERIFIED]**.
- **[UNVERIFIED]:** the order itself. Searches of Wallex, the Moniteur and SPW pages didn't find its number, date or text.

Normally the 1.C stretches reopen on 1 October, as the SPW's 30 September 2025 release says. That's why the seasonal date matters this year: 1 November is in the 1.C season under art. 4, but closed under art. 8.

## 3. How the app works today

- **Rules:** `src/access/walloon.ts` turns 28 stretches into `agw` records; `src/core/agw.ts` applies season, fishing days and hours; `src/core/access.ts` combines them.
- **Flow:** `src/core/flow.ts`. The 72 h mean below the minimum gives `low` (line 103); the 08:00 hourly above the maximum gives `high` (line 105). Flow applies only on today's date.
- **Unlisted water:** the `wallonia` region record in `src/access/data/regions.json` is `forbidden`. `src/access/README.md` still says unknown.
- **Aires:** none in the data. `aireWarnings` warns at each Walloon put-in or take-out with no access point of yours marked official aire within 200 m (`src/core/aire.ts`). So with no marks, every one warns.
- **Closures:** there's no way to express an ad hoc closure. The only text pointing outward is a link (`src/access/walloon.ts:28`) and the "Indicative only" notice.
- **Stretch data:** researched 2026-10-12, reviewed 2026-10-13.

Thresholds: the SPW's `tropar` pairs equal the app's `minM3s` and `maxM3s` on the matching stretches, and every value equals Annex 2. The one difference comes from the Semois split in section 4.

Gauges compared with the SPW's `station` field (SPW codes drop their `S` prefix to match the app's):

| Stretch | App | SPW | Result |
|---|---|---|---|
| Lesse, Han to Houyet (1C2b) | None (Annex 2 says Wanlin) | **L6610 Hérock** | **Answers an open question.** The app shows unknown forever |
| Salm (1C1b) | 6832 Trois-Ponts | **L6070 Trois-Ponts** | **Different station,** same place name |
| Our (1C4b) | 9914 Reuland | **L6330 Ouren** | **Different gauge.** Annex 2 says Reuland |
| Semois, Chassepierre to Linglé | 9434 Membre | **S9541 Chiny** | **Differs, see section 4** |
| Sûre | L5610 (assumed) | L5610 | Confirms the assumption |
| Semois lower | 9434 (assumed) | S9434 | Confirms |
| Amblève below Aywaille | 6621 (assumed) | S6621 | Confirms |
| Lesse below Houyet | 8221 (assumed) | S8221 | Confirms |
| Other 12 | | | Same |

Whether KiWIS carries 72 h and hourly series for L6070 and L6330 is **[UNVERIFIED]** because KiWIS was down. `docs/research/hydrometry.md` already says L6610 has discharge data.

## 4. Side by side, 2026-11-01

How the app's column was produced: a throwaway script ran the real code (`accessFeatures`, `accessAt`) on `builtInAccessRules`.

- **"With SPW figures"** feeds the SPW's own published flows into the app's code as readings, for the four gauges that have them.
- **KiWIS was unreachable** (see section 7), so no other gauge could be evaluated with live data. Where that's the case, the column gives the calendar result and what flow could change.
- A second run set every gauge to a hypothetical 0.1 m³/s. All 15 1.A and 1.B stretches went closed for low flow, but **all 12 gauged 1.C stretches stayed open**, because they have no minimum. 1C2b stayed unknown. So in any drought the app can't close a 1.C stretch.

| SPW stretch | SPW status | Gauge, 8 h, 72 h, min, max (m³/s) | App record(s) | App result | Match? | Root cause |
|---|---|---|---|---|---|---|
| AMBLEVE1 | **Open** (kayaks) | Stavelot 3.39, 4.069, 1.0, 21 | 1B1a | Open (with SPW figures) | Yes | |
| AMBLEVE3 | **Closed:** unsafe after floods; manual | Martinrive, none, 2.5, 44 | 1A1 | Calendar open; flow decides | **Likely no** | Ad hoc closure |
| LESSE2 | **Closed:** order | Daverdisse, none, none, 14 | 1C2a | Calendar open; no minimum | **No** | Ad hoc closure |
| LESSE4 | **Closed:** order | Hérock, none, none, 47 | 1C2b | Unknown (`no-gauge`) | **No** | Ad hoc closure, missing gauge |
| LESSE5 | **Open** (kayaks) | Gendron 2.082, 2.472, 2.0, 52 | 1B2a, 1B2b | Open | Yes | |
| LESSE6-7 | **Open** (kayaks) | Gendron 2.082, 2.472, 1.5, 52 | 1B2b, 1B2c, 1A2 | Open | Yes | |
| OURTHE1 | **Closed:** too low; manual | Nisramont, none, 3.0, 31 | 1A3a | Calendar open; flow decides | **[UNVERIFIED]** | Manual closure; KiWIS needed |
| OURTHE2 | **Closed:** too low; manual | Durbuy, none, 1.9, 50 | 1A3b | Calendar open; flow decides | **[UNVERIFIED]** | Manual closure; also an incident |
| OURTHE3 | **Closed:** manual, no reason | Tabreux, none, 2.5, 65 | 1A3c (first 22 km) | Calendar open; flow decides | **[UNVERIFIED]** | Manual closure |
| OURTHEOCC, OURTHEOR, SALM, SURE, OUR, AISNE, HOUILLE, VIERRE, SEMOIS1 | **Closed:** order | No figures published | 1C5b, 1C5c, 1C1b, 1C4a, 1C4b, 1C5a, 1C3, 1C6b, 1C6a | Calendar open; no minimum | **No** | Ad hoc closure |
| SEMOIS2-3, Chiny to Martué to Chassepierre | **Closed:** low (automatic) | Chiny 0.758, **1.416**, 1.5, 31 | 1B4a, 1B4b | Closed, low flow | Yes | |
| SEMOIS2-3, Chassepierre to Deleau | **Closed:** low | Same | **1B4c** (Membre 2.2, 50) | **Open** (3.134 ≥ 2.2) | **No** | Gauge split, see below |
| SEMOIS2-3, Deleau to Linglé (about 3 km) | **Closed:** low | Same | **1A4** (Membre) | **Open** | **No** | Gauge split |
| SEMOIS4-5 | **Open** (kayaks) | Membre 1.817, 3.134, 2.2, 50 | 1A4 | Open | Yes | |
| VIROIN | **Closed:** too low; manual | Treignes, none, 1.6, 23 | 1B3 | Calendar open; flow decides | **[UNVERIFIED]** | Manual closure |

Not on the SPW site at all, but open by calendar in the app:

| App stretch | Length in app | Note |
|---|---|---|
| Warche (1C1a) | 16.3 km | No SPW stretch, no aire |
| Lhomme (1C2c) | 29.3 km | No SPW stretch, no aire |
| Amblève, Remouchamps to Sougné (1B1b) | 1.3 km | No SPW stretch, no aire |
| Ourthe below Comblain (1A3c) | 33 km of 55.2 | The SPW stretch stops at Comblain-au-Pont |
| Part of Lesse 1C2b | 16 km of 27.0 | The SPW's text says Lessive to Wanlin is no longer reachable, as Lessive's aire has gone |
| Parts of 1A1, 1B1a, 1C1b, 1C3, 1C4a and others | 2 to 8 km each | The SPW lines are shorter; cause not established |

Totals: the app's stretches add up to 561 km, of which 422 km lie within 100 m of an SPW line. The SPW's lines total 455 km, which fits its stated 450 km.

## 5. Root causes

| # | Cause | Kind | Evidence | Who's right |
|---|---|---|---|---|
| 1 | Art. 8 ministerial closure of 1.C isn't modelled | **Missing ad hoc closure** | Site `justif`, 11 stretches | SPW, provided the order is in force. The art. 4 calendar is correct but doesn't override art. 8 |
| 2 | Manual closures aren't modelled (Ourthe 1 to 3, Viroin, Amblève 3) | **Missing ad hoc closure** | `mesnec=N`, no figures | Follow the SPW for safety. Whether each has a current legal basis is **[UNVERIFIED]**: the 2021 flood order ended on 31 October 2021, so Amblève 3's reason may be old |
| 3 | Semois gauge split differs | **Rule data versus practice** | SPW `SEMOIS2-3` uses Chiny down to Linglé; Annex 2 puts Chassepierre to Deleau on Membre | On the text, the app. But art. 6 §1 makes the site the publication channel, so a paddler should follow the site. Ask the SPW |
| 4 | Lesse Han to Houyet has no gauge | **Missing gauge** | SPW station L6610 Hérock | SPW practice answers it |
| 5 | Salm and Our gauges differ | **Possibly wrong gauge** | L6070, L6330 | App follows the Annex 2 place names; the SPW's real stations differ. Check the figures once KiWIS is back |
| 6 | Stretches with no SPW listing or aire show open | **Rule data versus practice** | Warche, Lhomme, others | The Annex 1 list allows them, but art. 5 needs an aire. Inference: you can't legally get on if none exists. **[UNVERIFIED]**: aires may exist that the site doesn't publish |
| 7 | KiWIS outage gives unknown everywhere; a hung request has no timeout | **Dependency, UI** | `src/hydrometry/kiwis.ts:101` has no timeout. Failures show unknown, but a request that never returns stays on "Checking flow…" (`src/core/access.ts:268`) | App bug-sized gap |
| 8 | The app says "Open" with no sign that official closures aren't checked | **UI** | `src/core/access.ts` rule text; the "Indicative only" notice sits in the access chip's dialog | App |
| 9 | Future dates can't show a known closure | **Date handling** | Flow only applies to today; a trip date in the order's period reads "Rules OK" | Consequence of cause 1 |

Not causes: date handling for today (art. 4 calendar and time zones are right), thresholds (all match), and staleness of the rule data (Annexes unchanged, on Wallex today). A point more than 30 m off the app's line reads `forbidden`: between 0 and 20% of sampled points on each SPW line fall there (Amblève 3 is highest), where SPW and OSM lines differ. Paddle legs follow OSM routing, so this probably rarely shows **[UNVERIFIED]**.

The two sets of positions fit well: 80 of 92 SPW aires lie within 30 m of an app stretch, and the other 12 are within 80 m of a stretch vertex, except Anseremme (270 m).

## 6. Options

Constraints: ADR 0011 (browser only), ADR 0012 (free), ADRs 0022 and 0024 (rule data prepared offline, KiWIS the only live exception). The site's REST API has no CORS, so using it would need a proxy, which ADR 0011 rules out. Only the ArcGIS service can be read directly.

| Option | Fixes | ADR impact | Permission | Effort, risk |
|---|---|---|---|---|
| **A. Be honest in the UI:** "Open by the rules; official closures aren't checked", with the SPW link beside every Walloon status | 8 | None | None | Small |
| **B. Small data and code fixes:** Hérock for 1C2b, compare Salm and Our, a KiWIS timeout | 4, 5, 7 | None | None | Small. Annex 2 says otherwise for some gauges, so mark as "SPW practice" |
| **C. Hand-kept closures in the rule data:** a dated list of stretches with reason and source | 1, 2, 9 (for known closures) | **None.** It's built-in data, kept by hand | None for facts stated publicly | Medium. Goes stale; needs an "until further notice" state and a review habit |
| **D. Live official status:** read layer 5 in the browser, 1.3 KB, cached 15 minutes, mapped offline from `nomtro` to records. Official status wins for today; computed status is the fallback | 1, 2, 3, 6 (for today) | **Breaks ADR 0024** as written (a second live source), so it needs an amendment. Fine with 0011 and 0012. Tests need fixtures and a manual check (ADR 0019) | **Ask the SPW.** ADR 0022's agreement covered flows and a computed status, not this service | Medium. Undocumented service; art. 6 of the service terms allows changes without notice |
| **E. Official aires as a built-in snapshot,** prepared offline from layer 3, kept in the repo with source and date | Question 1 | Fits ADR 0024's offline rule. **Reverses ADR 0023** on aires | **Written SPW agreement required.** Without it this breaks the CGU's redistribution ban | Medium. 92 points, mostly unchanged since 2016 |
| **F. Aires fetched live** from layer 3 | Question 1 | **Breaks ADR 0024** and ADR 0023 | Still needs asking: showing the data on a map is close to publishing it | Not recommended over E |
| **G. Your own marks, helped:** keep ADR 0023, and link to the SPW map to look up an aire | Part of question 1 | None | None | Small, but manual |

Do not scrape the REST API through a proxy: it breaks ADR 0011, and it's the option furthest from the terms.

**Recommendation.**

1. Now: **A** and **B**. Neither needs anyone's permission.
2. Now: **C** for the current 1.C closure, if the app should be correct this season, using the site's status as the source. It's the only way to correct future trip dates.
3. Ask the SPW at `info.kayak@spw.wallonie.be` for written agreement to read layers 3 and 5 from the app and to ship the aires, with the questions below. Sending that is Cedric's call.
4. If they agree: **D** and **E**, with ADR amendments to 0023 and 0024. **D** then replaces most of **C** for today's date.

## 7. Open questions and what couldn't be verified

- **The ministerial order:** number, date, text, and whether it covers only 1.C. Not found. Ask the SPW.
- **KiWIS:** down at every try from about 21:00 to 21:20 Brussels time on 2026-11-01. `getTimeseriesList` timed out from curl at 15 to 40 s, and from the browser it returned 503 with "maintenance downtime or capacity problems". The hydrometry home page loaded. So these could not be checked:
  - the app's real status on non-SPW-figure gauges;
  - whether the Ourthe and Viroin manual closures match real flows;
  - whether KiWIS values equal the SPW's published 8 h and 72 h figures;
  - whether KiWIS has discharge series for L6070 and L6330.
- **KiWIS again:** still down at about 09:00 Brussels time on 2026-11-02. `npm run check:kiwis` failed on its 30 s timeout, and a single-station `getTimeseriesList` and `getrequestinfo` both gave no answer in 60 s. The `hydrometrie.wallonie.be` front page answered, and so did the kayak site and the `PKAYAK` service, so the fault is on the KiWIS service itself. The kayak site still showed 17 closed and 4 open, the same 4 stretches. Neither the Ourthe and Viroin question nor the L6070 and L6330 question above could be answered.
  Re-run this comparison when it's back. Which status the user saw is **[UNVERIFIED]**.
- **Meaning of `mesnec`:** inferred from the form, not documented.
- **Semois split:** is Chiny to Linglé a deliberate SPW choice? Is it lawful against Annex 2? Ask.
- **Salm and Our:** which station is the reference, and is Annex 2 out of date?
- **Warche, Lhomme, Amblève 1B1b:** do they have designated aires?
- **Packrafts:** does status 1, "kayaks", include a 1 to 2 person packraft? Still open from `docs/research/access-rules.md`.
- **Navigable stretches:** the SPW's presentation page says some reaches classed navigable require a boat registered with the federal mobility service. The relevance to packrafts on 1.A was not looked into.
- **WalOnMap:** no kayak layer confirmed or ruled out.
- **Legal notices:** Metawal mentions notices in the app; none were found.

## 8. Existing notes this overtakes

Not changed here. To update later:

- `docs/research/data-sources.md`: "no public JSON endpoint" and "no kayak layer in the public map services" are out of date. The Walloon row for live status needs revising.
- `docs/research/hydrometry.md`: the Wanlin, Martelange, Membre, Martinrive and Gendron gaps are answered by the SPW's `station` field. Salm and Our have new doubts.
- `docs/research/access-rules.md`: add the FAQ's 8:20 time and art. 8's effect this year.
- `src/access/README.md`: says Walloon unlisted water is unknown; the data says forbidden.
- `docs/research/README.md`: should list this document.

## Sources

- SPW kayak site: [home](https://kayak.spw.wallonie.be/public/home); `/rest/services/troncons/`, `/rest/services/faqs/`, `/rest/services/news/`, `/rest/services/pages/{legal,presentation,recommendations,linksList}`; `/resources/js/pages/map.js`; `/public/config/default/fr/{widgets,catalog}.json`.
- [PKAYAK map service](https://geoservices3.wallonie.be/arcgis/rest/services/APP_KAYAK/PKAYAK/MapServer).
- [AGW of 19 March 2009, consolidated, Wallex](https://wallex.wallonie.be/files/pdfs/5/6718_Arr%C3%AAt%C3%A9_du_Gouvernement_wallon_r%C3%A9glementant_la_circulation_sur_et_dans_les_cours_d%27eau_01-09-2021-.pdf); [Annex 2](https://wallex.wallonie.be/files/medias/0/6394.pdf), as reproduced on the site's legal page.
- Drought: [wallonie.be feed](https://wallonie.be/fr/actualites/quel-est-letat-de-la-secheresse-en-wallonie), [CORTEX release 2026-10-12](https://cortex.wallonie.be/files/Communiqu%c3%a9s%20Presse/20261012-cp-celex-secheresse.pdf), [2026-10-01](https://cortex.wallonie.be/files/Communiqu%c3%a9s%20Presse/20261001-cp-celex-secheresse.pdf), [2026-09-22](https://cortex.wallonie.be/files/Communiqu%c3%a9s%20Presse/20260922-cp-celex-secheresse.pdf), [2025-09-30](https://cortex.wallonie.be/files/Communiqu%c3%a9s%20Presse/20250930%20CP%20CELEX%20S%c3%a9cheresse.pdf).
- Metawal: [dataset](https://metawal.wallonie.be/geonetwork/srv/api/records/634edbef-a925-41f4-9de1-fcac6a109361), [application](https://metawal.wallonie.be/geonetwork/srv/api/records/c94141c9-4422-4858-9274-e4b08dddc462).
- [ODWB dataset](https://www.odwb.be/explore/dataset/circulation-sur-les-cours-deau-en-wallonie/).
- Repo: files as cited, at commit `6ea4c8c`.
