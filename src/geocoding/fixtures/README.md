# Recorded Nominatim responses

Recorded once from OpenStreetMap Nominatim's reverse geocoding
(`https://nominatim.openstreetmap.org/reverse`) on Monday 26 October 2026,
one request at a time with a pause between them, identifying itself with the
project URL. Requests were `format=jsonv2&zoom=17&addressdetails=1`, with no
language preference (the app sends `accept-language=zxx`, which gives the same
local names). Tests replay these and never call the live service (ADR 0019,
ADR 0027). Every file is the service's answer byte for byte; each was a 200.

| File | Position | What it shows |
| --- | --- | --- |
| `reverse-road.json` | 50.268, 5.446 (Melreux, Hotton) | a road and a village: "Rue du Batty, Melreux" |
| `reverse-no-road.json` | 50.2165, 5.5160 (near Marcouray) | an unnamed road: no `road`, so the village alone, "Marcouray" |
| `reverse-nothing-found.json` | 51.6, 2.6 (the North Sea) | nothing found: `{"error":"Unable to geocode"}` |

Not recorded (synthesised in the tests instead, to keep live calls to a
minimum): failures (network error, 503, 429, a body that isn't JSON or isn't an
answer) and other address shapes (town, city, municipality only, no place).

`e2e/support/offline.ts` replays these files with `nominatimFixture(...)`.
