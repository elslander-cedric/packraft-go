# Walloon AGW 19 March 2009, Annex 1: the kayak whitelist

Extracted 2026-10-12 for packraft-go. Machine-readable version: [`data/walloon-stretches.json`](data/walloon-stretches.json). Gauge-to-station mapping: [hydrometry.md](hydrometry.md).

## TL;DR

- **Source:** Annex 1 PDF https://wallex.wallonie.be/files/medias/0/6393.pdf. It's one page, a Moniteur belge reprint (M.B. 15.04.2009, p. 30337). It **has a text layer**, so no OCR was needed.
- **The 2021 amendment didn't touch Annex 1.** The AGW of 8 July 2021 (art. 33) only replaces art. 5 paragraph 2, which says who designates launch and landing areas. The consolidated act page (version in force since 2021-09-01) still links the same 6393.pdf.
- **22 entries:** 4 in 1.A (navigable), 5 in 1.B (all year), 13 in 1.C (1 Oct to 15 Mar only).
- **Every entry has an Annex 2 gauge.** Four entries cover more than one Annex 2 reach (Ourthe 1.A, Lesse 1.B, Semois 1.B), so `data/walloon-stretches.json` splits them into **28 rows**, one gauge each.
- **No lengths in km** are given anywhere in the annexes.
- **Geocoding works for dams and named bridges.** Spot checks found 4 of 6 landmarks cleanly in OSM. The other two only have proxies.

## Rules attached to the categories (art. 4, for context)

- **1.A and 1.B:** open all year. **1.C:** open 1 October to 15 March only.
- **1.B and 1.C are closed on two fishing days:** trout opening (3rd Saturday of March) and general opening (1st Saturday of June).
- **Hours on 1.B and 1.C:** 10:00–17:00 from 1/10 to 15/6, and 9:30–18:00 from 16/6 to 30/9.
- **Hours on 1.A:** 9:30–19:00 from 16/3 to 15/6, 9:30–20:00 from 16/6 to 15/10, and 9:30–17:00 from 16/10 to 15/3.

## 1. Every Annex 1 entry, linked to Annex 2

The French is quoted from the PDF (shortened). "(not stated)" means Annex 1 gives only a start ("en aval de …"). The inferred end in the English column is my reading. Gauges and thresholds come from Annex 2 (hydrometry.md §5, rechecked against the Annex 2 PDF text).

### 1.A Navigable (open all year)

| ID | Sub-basin | River | From (fr) | To (fr) | From / to (en) | Annex 2 gauge | Min | Max |
|---|---|---|---|---|---|---|---|---|
| 1A1 | Amblève | Amblève | aval du pont de Sougné à Aywaille | confluent de l'Ourthe à Comblain-au-Pont | below Sougné bridge → Ourthe confluence, Comblain-au-Pont | Martinrive **[UNVERIFIED match]**¹ | 2.5 | 44 |
| 1A2 | Lesse | Lesse | premier barrage fixe de la Lesse à Anseremme | confluent de la Meuse à Anseremme | first fixed weir at Anseremme → Meuse confluence | Gendron **[UNVERIFIED match]**² | 1.5 | 52 |
| 1A3 | Ourthe | Ourthe | barrage de Nisramont (celui-ci non compris) | confluent de la Meuse à Liège | Nisramont dam (excluded) → Meuse confluence, Liège | split into 3, see below | | |
| 1A4 | Semois | Semois | moulin Deleau près d'Herbeumont | frontière française … (Bohan) | Deleau mill near Herbeumont → French border at Bohan | Membre | 2.2 | 50 |

1A3 split by Annex 2:
- **1A3a:** Nisramont → Maboge bridge. Gauge: Nisramont, 3.0 / 31.
- **1A3b:** Maboge bridge → Barvaux movable dam. Gauge: Durbuy, 1.9 / 50.
- **1A3c:** Barvaux movable dam → Liège. Gauge: Tabreux, 2.5 / 65.

### 1.B Non-navigable, open all year

| ID | Sub-basin | River | From (fr) | To (fr) | From / to (en) | Annex 2 gauge | Min | Max |
|---|---|---|---|---|---|---|---|---|
| 1B1a | Amblève | Amblève | aval de sa confluence avec la Warche | pont de Cheneux | below Warche confluence → Cheneux bridge | Stavelot | 1.0 | 21 |
| 1B1b | Amblève | Amblève | 200 m à l'amont du pont de Remouchamps | pont de Sougné à Aywaille | 200 m above Remouchamps bridge → Sougné bridge | Martinrive **[UNVERIFIED match]**¹ | 2.5 | 44 |
| 1B2 | Lesse | Lesse | lieu-dit "Al Mainprez" (100 m en amont du pont de Houyet) | (not stated) | 100 m above Houyet bridge → presumably the start of 1A2 (Anseremme weir) | split into 3, see below | | |
| 1B3 | Meuse amont | Viroin | "le Viroin" (whole river) | (whole river) | Eau Blanche + Eau Noire confluence at Nismes → French border below Treignes **[UNVERIFIED]** | Treignes | 1.6 | 23 |
| 1B4 | Semois | Semois | aval du rejet de la centrale hydroélectrique du barrage de la Vierre à Chiny | (not stated) | Vierre hydro plant outflow, Chiny → presumably Deleau mill (start of 1A4) | split into 3, see below | | |

1B2 split by Annex 2:
- **1B2a:** Houyet → 50 m above the Gendron–Celles road bridge. Gauge: Gendron, 2.0 / 52.
- **1B2b:** Gendron → Pont-à-Lesse. Gauge: Gendron, 1.5 / 52.
- **1B2c:** below Pont-à-Lesse. Gauge: Gendron, 1.5 / 52.

1B4 split by Annex 2:
- **1B4a:** Vierre outflow → Martué (included). Gauge: Chiny, 1.5 / 31.
- **1B4b:** Martué → Chassepierre bridge. Gauge: Chiny, 1.5 / 31.
- **1B4c:** Chassepierre bridge → Deleau mill. Gauge: Membre, 2.2 / 50.

### 1.C Non-navigable, open 1 Oct to 15 Mar only

| ID | Sub-basin | River | From (fr) | To (fr) | From / to (en) | Annex 2 gauge | Min | Max |
|---|---|---|---|---|---|---|---|---|
| 1C1a | Amblève | Warche | aval du barrage de Robertville | (not stated) | below Robertville dam → presumably Amblève confluence **[UNVERIFIED]** | Malmedy | – | 8.9 |
| 1C1b | Amblève | Salm | aval du barrage de Vielsalm | (not stated) | below Vielsalm dam → presumably Amblève confluence, Trois-Ponts | Trois-Ponts | – | 9.7 |
| 1C2a | Lesse | Lesse | depuis le pont des Barbouillons à Daverdisse | jusqu'à Chanly | Barbouillons bridge, Daverdisse → Chanly | Daverdisse | – | 14 |
| 1C2b | Lesse | Lesse | barrage du plan d'eau d'Han-sur-Lesse | jusqu'en amont du pont de Houyet | Han-sur-Lesse lake dam → just above Houyet bridge (Annex 2 says 100 m above) | Wanlin (no KiWIS station, see hydrometry.md) | – | 47 |
| 1C2c | Lesse | Lhomme | aval de Mirwart | (not stated) | below Mirwart → presumably Lesse confluence, Éprave **[UNVERIFIED]** | Jemelle | – | 11 |
| 1C3 | Meuse amont | Houille | aval de Patignies | (not stated) | below Patignies → presumably French border **[UNVERIFIED]** | Gedinne | – | 3.8 |
| 1C4a | Moselle | Sûre | aval de la rampe d'accès … à l'amont du pont de Bodange (Fauvillers) | (not stated) | access ramp above Bodange bridge → presumably Luxembourg border **[UNVERIFIED]** | Martelange | – | 9.9 |
| 1C4b | Moselle | Our | l'Our (province de Liège), en aval d'Auel | (not stated) | below Auel → presumably where the Our leaves Belgium, near Ouren **[UNVERIFIED]** | Reuland | – | 17 |
| 1C5a | Ourthe | Aisne | aval de sa confluence avec l'Estinée à Fanzel (Erezée) | (not stated) | below Estinée confluence, Fanzel → presumably Ourthe confluence, Bomal **[UNVERIFIED]** | Erezée | – | 4.4 |
| 1C5b | Ourthe | Ourthe occidentale | aval du pont de Prelle | (not stated) | below Prelle bridge → presumably Nisramont reservoir **[UNVERIFIED]** | Amberloup | – | 6 |
| 1C5c | Ourthe | Ourthe orientale | aval du pont de la Rue Porte à l'Eau à Houffalize | (not stated) | below the Rue Porte à l'Eau bridge, Houffalize → presumably Nisramont reservoir **[UNVERIFIED]** | Houffalize | – | 8.8 |
| 1C6a | Semois | Semois | pont de la route de Tintigny-Marbehan à Tintigny | rejet de la centrale … barrage de la Vierre à Chiny | Tintigny–Marbehan road bridge → Vierre hydro plant outflow, Chiny | Tintigny | – | 17 |
| 1C6b | Semois | Vierre | aval de la route de Straimont-Martilly à Martilly | pont-route Suxy-Chiny | Straimont–Martilly road, Martilly → Suxy–Chiny road bridge | Martilly | – | 8.6 |

**Notes on the Annex 2 match:**
1. **¹ Martinrive.** Annex 2 has the row "L'Amblève en aval du barrage de Lorcé". But Annex 1 never opens Lorcé → Remouchamps, so I assumed that row governs 1B1b and 1A1, the only Amblève reaches below Lorcé. That's a mismatch between the annexes. **[UNVERIFIED]**
2. **² Gendron.** The Annex 2 row "Lesse en aval de Pont-à-Lesse" covers the navigable 1A2 too. Annex 2 rows also cover parts of 1A3 and 1A4, so thresholds apparently apply to 1.A as well. **[UNVERIFIED]** legally.
3. **Wording differences between the annexes:**
   - Lesse 1C2a: Annex 1 says "depuis le pont" (from the bridge), Annex 2 says "en aval du pont" (below it).
   - Lesse 1C2b: Annex 1 says "jusqu'en amont du pont de Houyet" (to above Houyet bridge), Annex 2 says "100 m en amont" (100 m above).
4. **Overlaps:** 1B2 (Lesse) and 1B4 (Semois) have no stated end, so taken literally they overlap 1A2 and 1A4. I've cut them where 1.A starts.

## 2. Annex 3: what it contains

Annex 3 (https://wallex.wallonie.be/files/medias/0/6395.pdf) is **"signalétique"**: 6 pages of sign pictograms. The pictograms are images. The text layer only holds the page headers.

- **3.A Circulation:**
  - A.1.a / A.1.b: "open downstream, at these dates and hours" (A.1.b is the 1/10–15/3 sign).
  - A.2: hours sign for navigable rivers.
  - A.3: "closed downstream".
- **3.B Launch and landing areas:**
  - B.1: launch, left or right bank.
  - B.2: landing, left or right bank.
  - B.3: launch and landing.
  - B.4: no launching or landing.
- **3.C Plan d'eau (lake / water-sports zone):** C.1.
- **3.D Information:** D.1 dam ahead, D.2 "keep to the arrow side".
- **3.E Additional plates:** E.1 name of the area, E.2 distance (e.g. "300 m"), E.3 arrows for start, end and middle of a plan d'eau.

Annex 3 holds no geographic data. It could be useful later as app iconography: launch and landing icons, a dam warning.

## 3. Geocoding feasibility

### Spot checks

Spot checks were run on 2026-10-12.
- **Nominatim:** 7 queries, with a project User-Agent and ≥1.5 s between requests.
- **Overpass:** 2 attempts, both failed with "server too busy" (overpass-api.de and kumi.systems).

| Landmark | Result | Coordinates (lat, lon) | OSM object |
|---|---|---|---|
| Barrage de Nisramont | found | 50.14433, 5.66930 | `waterway=dam`, named |
| Barrage de Robertville | found | 50.45255, 6.10950 | `waterway=dam`, named |
| Pont des Barbouillons | found | 50.01144, 5.12888 | `man_made=bridge` named "Pont des Barbouillons" (OSM puts it in Redu/Libin, because the Lesse is the commune boundary) |
| Pont de Cheneux | found, ambiguous | 50.40554, 5.95918 (primary road) and 50.40458, 5.95426 (unclassified) | two highway ways both named "Pont de Cheneux", about 350 m apart. Pick the one crossing the Amblève. **[UNVERIFIED]** |
| Pont de Sougné (Aywaille) | proxy only | about 50.4806, 5.7070 | no bridge object. Only "Rue du Vieux Pont" and a bus stop "Remouchamps Pont de Sougné". **[UNVERIFIED]** |
| Moulin Deleau (Herbeumont) | not found | proxy: Avenue Georges Deleau, about 49.788, 5.231 | no mill or weir found by name. Overpass check failed. **[UNVERIFIED]** |

### Estimate for the rest

There are about 45 distinct landmarks: 22 entries × start and end, plus the Annex 2 split points. By type:

- **Easy and automatable (about 15).**
  - What: confluences of two named rivers and national borders.
  - Confluences: Amblève/Ourthe at Comblain, Lesse/Meuse, Warche/Amblève, Salm/Amblève, Lhomme/Lesse, Aisne/Ourthe, Aisne/Estinée.
  - Borders: Semois at Bohan, Viroin, Houille, Sûre, Our.
  - How: intersect OSM `waterway=river` relations with each other, or with the BE boundary.
  - Caveat: the Ourthe at Liège has two channels, the river and the Dérivation. **[UNVERIFIED]** which mouth is meant.
- **Easy (about 6).** Named dams that are likely `waterway=dam` or `weir`: Nisramont, Robertville, Vielsalm, Han-sur-Lesse, Barvaux movable dam, Vierre dam.
- **Medium (about 12).**
  - What: bridges described by road or village, not by an OSM name.
  - Examples: Remouchamps, Sougné, Houyet, Gendron–Celles, Maboge, Chassepierre, Prelle, Bodange, Tintigny–Marbehan, Suxy–Chiny, Rue Porte à l'Eau (Houffalize), Straimont–Martilly road.
  - How: find where the named road or village crosses the named river. Usually one candidate, but each needs a human glance.
- **Hard (about 8).**
  - Vague or unmapped points: "aval de [village]" (Mirwart, Patignies, Auel, Chanly, Martué); the Anseremme "first fixed weir"; the Vierre hydro plant outflow at Chiny; the Bodange access ramp; Moulin Deleau; the "Al Mainprez" locality, which can be derived from Houyet bridge minus 100 m.
  - How: snap the village node to the river and accept ±500 m, or pick the point by hand.

**Recommendation:** don't geocode at runtime. Build a hand-curated `annex1-points.json` once:
1. Fetch each river line from OSM.
2. Pick start and end points: auto for confluences and borders, manual for the rest.
3. Cut the line between the two points.

That's roughly **2–4 hours** of one-off curation with an OSM map open. The open-ended "(not stated)" ends need a decision first. My inferences above are the obvious candidates.

## 4. Totals

| Category | Annex 1 entries | JSON rows (after Annex 2 splits) |
|---|---|---|
| 1.A navigable, all year | 4 | 6 |
| 1.B non-navigable, all year | 5 | 9 |
| 1.C non-navigable, 1 Oct–15 Mar | 13 | 13 |
| **Total** | **22** | **28** |

- **No km are stated** in Annex 1, 2 or 3.
- The longest entries are the Ourthe (1A3, Nisramont to Liège, probably over 100 km) and the Semois (1A4 + 1B4, plus 1C6a).
- My rough order of magnitude for the whole whitelist is a few hundred km. **[UNVERIFIED]** Measure it from OSM river lines once the cut points exist.

## 5. `data/walloon-stretches.json` schema

An array of objects, one per gauge-homogeneous reach:

```
{
  id:          string   // "1A3b". Annex 1 numbering plus a letter for the Annex 2 split
  annex1Ref:   string   // the Annex 1 entry this row belongs to ("1A3"). Extra field
  category:    "1.A" | "1.B" | "1.C"
  subBasin:    string   // as in the annex: "Amblève", "Lesse", "Meuse amont", "Moselle", "Ourthe", "Semois"
  river:       string
  from:        { fr: string, en: string }
  to:          { fr: string, en: string }   // "(non précisé)" when Annex 1 gives no end
  annex2Gauge: string | null                // Annex 2 "point d'observation" name, not a KiWIS id
  minM3s:      number | null
  maxM3s:      number | null
  note?:       string   // extra field: inference or split source. Contains [UNVERIFIED] where relevant
}
```

- Every row has a gauge, so `annex2Gauge` is never null in practice.
- Map gauge names to KiWIS `station_no` with the table in hydrometry.md §5.

## Sources

- Annex 1: https://wallex.wallonie.be/files/medias/0/6393.pdf
- Annex 2: https://wallex.wallonie.be/files/medias/0/6394.pdf
- Annex 3: https://wallex.wallonie.be/files/medias/0/6395.pdf
- Consolidated act, in force since 2021-09-01: https://wallex.wallonie.be/contents/acts/6/6718.html
- Amending AGW of 8 July 2021, ch. XII, art. 33: https://wallex.wallonie.be/eli/arrete/2021/07/08/2021031919/2021/09/01
- OSM data © OpenStreetMap contributors (ODbL), via Nominatim.
