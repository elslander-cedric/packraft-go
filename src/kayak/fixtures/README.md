# Recorded PKAYAK responses

Recorded once from the SPW's public map service
(`https://geoservices3.wallonie.be/arcgis/rest/services/APP_KAYAK/PKAYAK/MapServer`)
on Monday 2 November 2026 at about 10:30 Belgian time (CET, +01:00). Tests replay
these and never call the live service (ADR 0019, ADR 0035).

| File | Request | Response |
| --- | --- | --- |
| `layer5-stretches.json` | Layer 5 `query`, `where=1=1`, `returnGeometry=false`, `f=json` | 200, the 21 official stretches |
| `layer0-incidents.json` | Layer 0 `query`, the app's exact `incidentsUrl()`, recorded the same day at about 13:58 | 200, the 3 current incidents |

`layer5-stretches.json` isn't byte for byte: the recording used `outFields=*`, and
the file was then trimmed to the four fields the app asks for (`nomtro`, `stapub`,
`justie`, `justif`), in `features` as well as in `fields` and `fieldAliases`, to
keep live calls to a minimum. The values are untouched.

What the recording shows, and the tests rely on:
- A drought: 17 stretches closed (`stapub` is the string `"0"`) and 4 open (`"1"`):
  `SEMOIS4-5`, `LESSE5`, `LESSE6-7` and `AMBLEVE1`.
- The 11 Annex 1.C stretches closed by ministerial order, with that reason in
  French in `justif`, e.g. `SALM`.
- `AMBLEVE3` closed with its own reason, "Rivière non sécurisée suite aux
  inondations"; `OURTHE1`, `OURTHE2` and `VIROIN` closed as too low.
- `SEMOIS2-3` and `OURTHE3` closed with no reason at all (`justif` is null).
- An open stretch's `justif` is an empty string. `justie`, the English reason, is
  null on every stretch.

`layer0-incidents.json` is byte for byte. What it shows, and the tests rely on:
- 3 incidents: id 1 on `LESSE6-7`, created 2018-04-30 and changed 2021-04-16, and
  ids 2002 and 2003 on `OURTHE2`, created 2026-03-02. Dates are milliseconds since
  the epoch; 2002 has no changed date (`datmod` is null).
- No incident has an expiry (`datexp` is null on all 3).
- All 3 have French (`commen`) and English (`commene`) text.
- Id 2003 says the river is closed, which never changes an access state.

Not recorded (synthesised in the tests instead): codes 2 to 5 and unknown codes,
an English reason, an incident with an expiry or only French text, and failures
(network error, 503, a body that isn't JSON, an ArcGIS error inside a 200).

`e2e/support/offline.ts` replays these files with `kayakFixture(...)`; the e2e tests
set the page's clock to the recording's day.
