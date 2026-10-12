# Recorded BRouter responses

Recorded once from the public server (https://brouter.de/brouter, BRouter 1.7.10,
profile `hiking-mountain`, `format=geojson`) on 2026-10-11. Tests replay these and
never call the live server (ADR 0019).

| File | Request `lonlats` | Response |
| --- | --- | --- |
| `hiking-success.geojson` | `5.4561,50.3527\|5.4700,50.3440` | 200, 159-point track with elevations |
| `hiking-missing-elevation.geojson` | `2.5000,51.6000\|2.5200,51.6100` | 200, ferry track whose points carry no elevation |
| `hiking-no-route-single-point.geojson` | `2.9000,51.5000\|2.9200,51.5100` | 200, degenerate one-point track (nothing to walk) |
| `hiking-no-route-400.txt` | `-30.0,40.0\|-29.9,40.05` | 400 `text/plain`, BRouter's routing-error message |

River profile (`profile=river`, same server and version), recorded on 2026-10-11:

| File | Request `lonlats` | Response |
| --- | --- | --- |
| `river-success.geojson` | `4.9330,50.2160\|4.9120,50.2370` | 200, 135-point track down the Lesse from near Walzin to Anseremme (5892 m, 99.25 m to 92 m: 7.25 m drop) |

## Checking the live server still matches

`npm run check:brouter` replays four of these requests (all but the single-point
one) against the live server and reports whether the answers still match. It only
reads these files. If it reports drift or a mismatch, re-record by hand: fetch the
URL it prints, save the body over the fixture, update this README, and fix the tests.
The request points live in `liveCheckCases` in `../liveCheck.ts`; keep them in step
with the table above.
