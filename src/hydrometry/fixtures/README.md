# Recorded KiWIS responses

Recorded once from the SPW's public hydrometry service
(`https://hydrometrie.wallonie.be/services/KiWIS/KiWIS`) on Wednesday 14 October
2026 at 08:58 Belgian time (CEST, +02:00), one request at a time, identifying
itself with the project URL only. Tests replay these and never call the live
service (ADR 0019, ADR 0024). Both files are the service's answers byte for byte.

| File | Request | Response |
| --- | --- | --- |
| `timeseries-list.json` | `getTimeseriesList` for the 21 Annex 2 gauges of `src/data/walloon-stretches.json`, `ts_name=34-Debit.3jMob.Moyen,10-Debit.1h.Moyen`, `returnfields=station_no,ts_id,ts_name` | 200, a table: a header row, then 42 series (2 per gauge) |
| `timeseries-values.json` | `getTimeseriesValues` for those 42 `ts_id`s, `period=P1D`, `returnfields=Timestamp,Value` | 200, one entry per series: the day's 72-hour mean (stamped 01:00) and 23 or 24 hourly means |

What the recording shows, and the tests rely on:
- A dry October: most stretches with a minimum are closed on low flow (e.g. the
  Semois at Membre, 72-hour mean 1.407 m³/s, minimum 2.2). The Amblève at
  Stavelot is open (4.444 m³/s, minimum 1; 08:00 flow 4.429, maximum 21).
- The AQUALIM gauges (station numbers starting with `L`) had not yet published
  their 08:00 hourly value: their latest is 07:00, so those stretches are
  "flow unknown: today's 08:00 flow isn't measured yet".
- Timestamps are Belgian local time with their offset.

Not recorded (synthesised in the tests instead, to keep live calls to a minimum):
failures (network error, 503/500, a body that isn't JSON or isn't a table), a
gauge with no series (asked for a station that isn't in the list answer), and
stale data (the same answer, read a day later).

`e2e/support/offline.ts` replays these files with `kiwisFixtures(...)`; the e2e
tests set the page's clock to the recording's morning.

#64 adds a manual contract check against the live service; re-record by hand
only when it reports a mismatch.
