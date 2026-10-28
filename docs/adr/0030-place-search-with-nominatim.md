# 30. Place search with Nominatim

Date: 2026-10-28

## Status
Accepted

## Context
Planning starts from places you know by name: a village, a weir, a bridge, an address. Panning and zooming the map to find them is slow, especially on the phone. Place search (GLOSSARY) lets you type what a place is called, or its coordinates, and moves the map to the search result you pick. It only shows you the spot. Nominatim already gives access points their default names (ADR 0027), and its search is free, needs no key and uses OpenStreetMap like the rest of the stack (ADRs 0004, 0012). Its usage policy forbids autocomplete, allows at most one request a second per application (all users together) and warns that apps sending the same query again and again may be blocked.

## Decision
- **Search on submit, never as you type.** Enter or the magnifier sends one request for a short list of results (`limit=5`). There is no autocomplete, no history and nothing is saved.
- **Only the search text and the visible map area are sent.** The area goes as `viewbox` with `bounded=0`, so it ranks results without filtering them; there is no `countrycodes`, so anything Nominatim finds can appear. Labels are local names (`accept-language=zxx`, as for default names).
- **Coordinates never leave the device.** Text like `50.27, 5.44` (decimal degrees, latitude first) is recognised in the core and jumps there with no request; out-of-range coordinates read as bad coordinates.
- **One Nominatim client, one line.** `src/geocoding/` keeps a single client shared by place search and default names, with one queue of at most one request a second. A waiting search goes before waiting default-name lookups, because you are waiting on it; it never cuts off a request already running.
- **Answers are kept in memory for the session.** The key is the trimmed, lower-cased text plus the visible area rounded to 2 decimals. Found and nothing-found answers are kept; failures are not, so Retry really asks again. The cache is the adapter's; the core and the UI don't know about it.
- **The search state is not part of the planner session** (ADR 0025): it is about the map, not the trip, so it has its own pure reducer in the core, and trip actions (new trip, open, undo, edits) never touch the shown result.

## Considered options
- **Autocomplete:** forbidden by the usage policy.
- **Limit results to Belgium (`countrycodes` or `bounded=1`):** trips cross borders and the viewbox already ranks nearby places first; a hard filter would hide the place you typed.
- **Another geocoder (Photon, a paid API):** a second service to depend on and test for no gain; paid ones break ADR 0012.
- **Search state in the planner session:** it would make search answer to the trip's rules (cleared on undo or new trip) for no benefit.

## Consequences
- This is the second thing sent to Nominatim: your search text and the visible map area. Nothing about your trip or your access points is sent with it.
- Default names can wait up to a second longer while you search.
- The service's URL stays in one constant, so the app can switch to another Nominatim instance if asked to.
- Tests replay recorded `/search` answers from `src/geocoding/fixtures/`, never the live server (ADR 0019).
