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
