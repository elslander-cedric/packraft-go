# Geocoding and place search

## Nominatim client

ADRs 0027, 0030; #136, #172. The only module that talks to Nominatim and the only one that sends access point positions anywhere.

- `createNominatim()` in `nominatim.ts` is one client with one line: requests at least a second apart, and a waiting search goes before waiting default names. It serves both:
  - the core's `DefaultNameSource`: reverse geocoding to "road, place" in local names;
  - its `PlaceSearchSource` (`src/core/placeSearch.ts`): place search sends only the text and the visible area; answers are kept in memory for the session, failures not.
- The page shares one lazily imported client through `src/ui/sharedNominatim.ts`.
- `src/ui/defaultNames.ts` works through the points waiting for a default name whenever the app is online.

## Place search

#173, #174, ADR 0030.

- `parseCoordinates` and the search reducer are in `src/core/placeSearch.ts` (not part of the planner session).
- `usePlaceSearch` in `src/ui/` uses the shared Nominatim client.
- The field and its results are in `src/ui/PlaceSearchBar.tsx`, the result's pin in `src/map/SearchResultLayer.tsx`.
- `src/ui/planner/PlaceSearch.tsx` is a pill on the top row between the menu and the right-hand buttons that opens into the inline field, above the keyboard (`useVisibleArea`). The access chip sits on a second row under it, right-aligned beside the layers button.
- A result is fitted into the part of the map the pill, sheet or side panel leave free (`searchCover` in `Planner`).

## Tests

Recorded answers live in `fixtures/` (see its README); e2e tests replay them with `nominatimFixture(...)` or `nominatimFixtures({ reverse, search })` in `e2e/support/offline.ts`.
