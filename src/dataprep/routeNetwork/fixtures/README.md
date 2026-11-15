# Recorded answers for the route network tests

Tests replay these and never call a live service (ADR 0019).

| File | What |
| --- | --- |
| `lesse-1A2.json` | Walloon stretch record 1A2 (the Lesse from the Anseremme weir to the Meuse) and a trimmed Overpass answer for it |
| `walk-over-ceiling.geojson` | BRouter 1.7.11-beta, 2026-11-15: `lonlats=5.20387,49.80789\|5.25834,49.72318&profile=hiking-mountain&profile:hiking_routes_preference=1`, official aires 16 to 100 on the Semois, a 15 007 m walk (just over the walking link ceiling) |

The walking link tests also use `hiking-trail-preference.geojson` and the no-route answers in `src/routing/fixtures/`.
