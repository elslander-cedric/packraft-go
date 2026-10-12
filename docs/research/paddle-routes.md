# Paddle routes in Belgium

Researched 2026-10-12. For access rules, see [access-rules.md](access-rules.md). For whether this data can be used in the app, see [data-sources.md](data-sources.md).

**Summary:** Flanders has a marketed route network (Sport Vlaanderen / Peddelsport Vlaanderen) on canals and designated rivers. Wallonia has no official "routes". Instead it has **legal stretches** with designated put-in and take-out points, and rental operators package trips on them. The Ardennes rivers are where packrafting's hike + paddle mix makes most sense: hike between stretches, paddle the open ones.

## Official route sets

| Route set | Region | What a route contains | Source |
|---|---|---|---|
| **Sport Vlaanderen kayak, canoe and SUP routes** ("Peddelroutes") | Flanders | Name, description, length (e.g. Dijle 34.1 km), start and end points, a list of put-in places, a difficulty label (easy / medium / hard / very hard), a downloads tab, reviews, and a "routemeldpunt" for reporting problems. No portage information was visible. | [route list](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute?type=kayak), [example: Dijle](https://www.sport.vlaanderen/sporten-in-mijn-omgeving/vind-een-route/vind-een-kajak-kano-suproute/route/5110146) |
| **Peddelsport Vlaanderen route network** | Flanders | The same network, chosen each year by Peddelsport Vlaanderen and Sport Vlaanderen with local partners. Peddelsport has no separate route list. | [peddelroutes ontdekken](https://www.peddelsport.vlaanderen/waar-het-water-op/peddelroutes-ontdekken) |
| **VMM stretches** | Flanders (non-navigable rivers) | Zenne, Dijle, Kleine Nete, Stekene/Zuidlede. Each has put-in points, hours, a code of conduct and a map PDF, and links to the Sport Vlaanderen route pages. | [VMM](https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten) |
| **Walloon legal stretches** (AGW Annex 1) | Wallonia | Stretches with a category (A/B/C), a reference gauge, minimum and maximum flow, and designated put-in and take-out points ("aires"). | [AGW 2009](https://wallex.wallonie.be/files/pdfs/5/6718_Arr%C3%AAt%C3%A9_du_Gouvernement_wallon_r%C3%A9glementant_la_circulation_sur_et_dans_les_cours_d%27eau_01-09-2021-.pdf), [kayak.spw.wallonie.be](https://kayak.spw.wallonie.be/) |
| **Peddelsport "Wallonië" page** | Wallonia and border rivers | A summary of the Walloon rules, plus gauge tips for rivers just across the border (Rur, Perlbach, Prüm, Cure, Chaleau). | [Peddelsport Wallonië](https://www.peddelsport.vlaanderen/waar-het-water-op/wallonie) |

Sport Vlaanderen opened 4 new routes in 2020: Waasland, Kempen, and two in Vlaams-Brabant ([Sporza](https://sporza.be/nl/2020/07/13/sport-vlaanderen-opent-nieuw-peddeltraject-in-aarschot/)). **[UNVERIFIED]:** the current total number of routes.

## Walloon rivers most relevant to packrafting

From the official Walloon overview ([wallonie.be](https://www.wallonie.be/fr/demarches/sinformer-sur-la-pratique-du-canoe-kayak-en-wallonie)):

- **"Touristic" stretches, usually open in summer when flow allows:** Amblève, Ourthe, Lesse, Semois, Viroin.
- **"Sporting" stretches, autumn and winter only (category 1.C):** upper reaches of the big rivers, Our, Sûre, Vierre, Aisne, Salm.

The test fixture for packraft-go's paddle legs is on the Lesse (Walzin → Anseremme), a touristic stretch.

## What this means for packraft-go

- **Put-ins and take-outs matter legally in Wallonia.** You may only get in or out at designated aires. Today the app lets you put a put-in anywhere, so in Wallonia a mode change should eventually snap to, or at least warn about, the nearest aire.
- **Portages around locks are mandatory in Flanders.** This matches ADR 0016 (portages are short hike legs). Locks are tagged in OpenStreetMap and could be detected.
- **Official routes could be shown as suggestions or overlays,** but only if the data licence allows it, which today it doesn't (see [data-sources.md](data-sources.md)).
