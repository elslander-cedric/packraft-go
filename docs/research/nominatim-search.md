# Nominatim `/search`: usage policy and parameters

Researched 2026-10-28 for place search (#167, #168). Sources: the OSMF Nominatim usage policy, the Nominatim API docs (`latest`), and the Nominatim source code on `master` (latest release v5.3.3, 2026-10-14). No live API call was made; everything below comes from reading those pages and files. **[UNVERIFIED]** marks what they don't settle.

Sources, cited below by letter:

- **[P]** Usage policy: https://operations.osmfoundation.org/policies/nominatim/
- **[S]** Search API: https://nominatim.org/release-docs/latest/api/Search/
- **[O]** Output formats: https://nominatim.org/release-docs/latest/api/Output/
- **[C]** Source, `osm-search/Nominatim` on GitHub, `master`:
  - `src/nominatim_api/v1/server_glue.py` (parameter parsing)
  - `src/nominatim_api/v1/format.py` and `v1/format_json.py` (output and errors)
  - `src/nominatim_api/search/db_searches/place_search.py` and `types.py` (viewbox ranking)
  - `src/nominatim_api/localization.py` and `search/geocoder.py` (languages)

## TL;DR

- **Search on submit is allowed and search-as-you-type is not.** The policy accepts use "directly triggered by the end-user (for example, user searches for something)". It says client-side auto-complete is "not yet supported by Nominatim and you must not implement such a service on the client side" [P].
- **The browser Referer identifies the app, as it does for reverse lookups.** The policy asks for "a valid HTTP Referer or User-Agent identifying the application" [P] and makes no exception for search.
- **There is one budget per application, not one per endpoint.** The limit is "an absolute maximum of 1 request per second", it applies "per website/application", and "the sum of traffic by all your users should not exceed the limits" [P]. Search and reverse lookups are the same application, so they share it.
- **Use `viewbox` with `bounded=0` and leave out `countrycodes`.** With `bounded=0`, `viewbox` only re-ranks results: those inside the visible area get no penalty, those in a box twice as wide and tall get +0.5, and everything else gets +1.0. Important places further away still appear [S][C].
- **For `jsonv2`:** `name` is a short label, `display_name` the full address, and `boundingbox` is `[minlat, maxlat, minlon, maxlon]` as strings. Nothing found returns `[]`; errors return `{"error":{"code":…,"message":…}}` [O][C].
- **`limit` defaults to 10.** The docs give 40 as the maximum, but the code clamps to 50 [S][C].

## 1. Usage policy, applied to search

The quotes below are exact wording from [P].

| Topic | Policy wording | What it means for place search |
|---|---|---|
| Rate | "No heavy uses (an absolute maximum of 1 request per second)." | At most one request a second. |
| Scope of the limit | "Note that the usage limits above apply per website/application"; "the sum of traffic by all your users should not exceed the limits." | The limit covers packraft-go as a whole, across all users, devices and endpoints. A queue on each device keeps that device polite but can't enforce the global sum. The app relies on low total use, as the reverse lookups already do. |
| User-triggered use | "Use that is directly triggered by the end-user (for example, user searches for something) is ok," | Searching when you press Enter or the search button is the intended use. |
| Periodic use | "periodic requests from apps are considered bulk geocoding and as such are strongly discouraged." | Don't search in the background or repeat a search on a timer. |
| Autocomplete | "Auto-complete search": "This is not yet supported by Nominatim and you must not implement such a service on the client side" | Never search as you type. This matches #167's out-of-scope list. |
| Identification | "Provide a valid HTTP Referer or User-Agent identifying the application"; stock User-Agents from HTTP libraries are not acceptable. | A browser `fetch` sends a Referer, which is enough, as for `/reverse` (`src/geocoding/nominatim.ts`). Under the browsers' default `strict-origin-when-cross-origin` policy, a cross-origin Referer carries only the origin, which still names the app. Don't set `Referrer-Policy: no-referrer`. |
| Caching | For apps: "If at all possible, set up a proxy and also enable caching of requests." For bulk use: "Results must be cached on your side." "Clients sending repeatedly the same query may be classified as faulty and blocked." | v1 has no server (ADR 0011), so a proxy isn't possible. Keep the last answers in memory for the session, so that submitting the same text and area twice, or pressing Retry after a success, doesn't send another request. Retry only after a failure. |
| Switching | "Apps must make sure that they can switch the service at our request at any time" | Keep the base URL in one constant in `src/geocoding/`, as `NOMINATIM_URL` is now, so the service can be replaced in one place. |
| Attribution | "Clearly display attribution as suitable for your medium." The data is ODbL. | The map's existing "© OpenStreetMap contributors" credit covers it, as for reverse lookups (ADR 0027). |
| Browsers | The policy says nothing about browsers or client-side JavaScript specifically. | The website/app rules above are the ones that apply. |

The policy defines no HTTP status for "too many requests" and documents no error body for it. A 429, a 403 or a block page are all plausible; treat any non-200 status as a failure **[UNVERIFIED]**.

## 2. Ranking by the visible map: `viewbox`, `bounded`, `countrycodes`

From [S]:

- `viewbox=<x1>,<y1>,<x2>,<y2>`: "`x` is longitude, `y` is latitude." "Any two corner points of the box are accepted as long as they make a proper box." It is a "Boost parameter which focuses the search on the given area", and boost parameters "only change the order of the results".
- `bounded` (default 0): "When set to 1, then it turns the 'viewbox' parameter (see above) into a filter parameter", "excluding any results outside the viewbox." Also, "When `bounded=1` is given and the viewbox is small enough, then an amenity-only search is allowed."
- `countrycodes`: "Filter that limits the search results to one or more countries." It takes ISO 3166-1 alpha-2 codes.

The code [C] (`place_search.py`, `types.py`) shows exactly how far results outside the viewbox still appear when `bounded=0`:

```python
penalty += sa.case((t.c.centroid.intersects(VIEWBOX_PARAM, use_index=False), 0.0),
                   (t.c.centroid.intersects(VIEWBOX2_PARAM, use_index=False), 0.5),
                   else_=1.0)
```

`viewbox_x2` is the viewbox grown by half its width on each side and half its height on top and bottom, so it is twice as wide and twice as tall. The penalty is added to a ranking that also uses importance and how well the words match. A large, well-matching place far away can therefore still beat a small one in view. When `bounded` is off, the code also keeps only candidates whose `penalty - importance` is within 0.5 of the best one.

For place search:

- Send the visible map area as `viewbox` with `bounded=0` (or leave `bounded` out, since 0 is the default). Results in view rank first, and far-away matches still appear. This is the "ranked by the visible map area, no country limit" choice in #167.
- Don't send `countrycodes`: it filters out other countries, and the search should find anything Nominatim knows.
- Don't use `bounded=1`. It would hide everything outside the view, and its amenity-only searches aren't needed.
- Ranking is decided on the result's **centroid**, not its whole area.
- The Leaflet bounds give the four numbers: `west,south,east,north` is a valid order.

## 3. Result shape for `format=jsonv2`

The `/search` answer is always a JSON **array**. For the non-"simple" formatter, `format_base_json` does `out.start_array()` [C]. Fields, from [O], the `jsonv2` example in [S] and `format_json.py` [C]:

| Field | Meaning | Notes for the app |
|---|---|---|
| `name` | The place's own name, in the requested language order. `format_json.py` writes `result.locale_name or ''`. | The short label, e.g. "Hotton". It **can be `""`**, e.g. for an address or an unnamed road; then fall back to the start of `display_name`. |
| `display_name` | "full comma-separated address" [O] | Long and repeats the name; use it as the second line or the fallback. |
| `address` | "dictionary of address details", "only with `addressdetails=1`" [O]. Keys include `road`, `house_number`, `village`, `town`, `city`, `municipality`, `county`, `state`, `postcode`, `country`, `country_code` and more [O]. | Optional. It gives a short context ("Hotton, Luxembourg") without parsing `display_name`. Leave it out unless the label needs it, to keep answers small. |
| `category`, `type` | "key and value of the main OSM tag". `jsonv2` renames `class` to `category` [O]. | E.g. `place`/`village`, `waterway`/`river`. |
| `addresstype` | A label tag computed from the category, extra tags, address rank and country (`cl.get_label_tag(...)`) [C]. Not described in the Output page's field list, but present in the `jsonv2` example [S]. | E.g. `village`, `shop`, `road`. Usable as a small type hint. |
| `boundingbox` | "min latitude, max latitude, min longitude, max longitude" [O]. Four **strings** with 7 decimals [C]. | The order is `[south, north, west, east]`, which is **not** the viewbox order. Parse with `Number(...)`. |
| `lat`, `lon` | "latitude and longitude of the centroid" [O]. Strings with 7 decimals [C]. | Where the result marker goes. |
| `place_rank` | `jsonv2` only: "the search rank of the object" [O]. | Not needed. |
| `importance` | "computed importance rank" [O] | Not needed; results are already sorted. |
| `place_id`, `osm_type`, `osm_id`, `licence` | Internal ID (not persistent), OSM reference, licence text [O]. | `osm_type` + `osm_id` make a stable list key. |

### `accept-language=zxx` for search

- The language comes from the `accept-language` parameter, then the HTTP header, then the server's default [C, `server_glue.py`].
- Names are picked in the order `name:<lang>`, then plain `name`, and if neither exists the first name the place has [C, `localization.py`]. No place has a `name:zxx`, so `zxx` gives the local `name` for `name` and for every part of `display_name`, as for reverse lookups. "Liège" stays "Liège" whatever the browser's language. Without the parameter, a Dutch browser's header would make it "Luik".
- Language affects only the **labels** and a re-ranking step, not what can be found. A Dutch exonym query such as "Luik" still finds Liège through its `name:nl`. The re-ranking compares the query words with the localized label (`rerank_by_query`, `_get_result_rerank_text`), so with `zxx` a result matched only through an exonym gets a small word-distance penalty. **[UNVERIFIED]** whether this ever changes the order in practice; it is an inference from the code, not a test.
- Using `zxx` for search too keeps search results and default names in the same, local form, as on signs.

## 4. `limit`, nothing found, errors

- **`limit`:** the default is 10. [S] says it "Cannot be more than 40", but `server_glue.py` clamps to `max(1, min(50, params.get_int('limit', 10)))` [C]. Either way, a short list (5 to 10) is well within limits. "Nominatim may decide to return less results than given, if additional results do not sufficiently match the query." [S]
- **Dedupe:** `dedupe` (default 1) merges several OSM objects that are the same real place [S], so fewer results than `limit` is normal.
- **Nothing found:** HTTP 200 with the empty array `[]` [C]. This differs from `/reverse`, which answers `{"error":"Unable to geocode"}` (the "simple" formatter, `format_json.py` [C]; recorded in `src/geocoding/fixtures/reverse-nothing-found.json`).
- **Errors:** bad parameters return HTTP 400 by default (`raise_error(self, msg, status=400)`, `asgi_adaptor.py`), with a JSON body for JSON formats [C, `format.py`]:

  ```json
  {"error": {"code": 400, "message": "…"}}
  ```

  Throttling, blocking and server errors come from the operator's infrastructure; no body is documented for them **[UNVERIFIED]**. Treat any non-200 status, a network failure or a body that isn't an array as "search failed" (Retry). Treat `[]` as "nothing found".
- **`format` must be sent:** "When the `format` parameter is omitted, the request will be forwarded to the Web UI." [S]

## 5. Do search and reverse lookups share the 1 request/second limit?

**Yes.** The policy sets its limits "per website/application" and counts "the sum of traffic by all your users" [P]. It never splits them by endpoint. The policy doesn't say so in those words; this is the natural reading. Today `createNominatimNames` in `src/geocoding/nominatim.ts` keeps its own 1-second queue for reverse lookups. A second, independent queue for search could send two requests within a second. One queue in `src/geocoding/` shared by both is the policy-safe design. Which request goes first is a product decision for #167 (a search you just submitted is something you are waiting for; default names are not).

## Suggested request

```
https://nominatim.openstreetmap.org/search
  ?format=jsonv2
  &q=<typed text>
  &viewbox=<west>,<south>,<east>,<north>
  &bounded=0                  (or omit: the default)
  &limit=<5..10>
  &accept-language=zxx
```

Optionally add `addressdetails=1` if the result list shows a place/municipality context line. Leave out `countrycodes`, `email` (meant for "large numbers of request", [S]) and the polygon options.
