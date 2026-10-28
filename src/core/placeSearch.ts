// Place search (ADR 0030, #167, #172): find a place by what it is called and move
// the map there. These are the core's types; the Nominatim adapter in
// src/geocoding/ implements the source.
import type { LatLng } from "./trip";

/** An area of the map, in degrees: the visible map when searching, or a result's extent. */
export type SearchArea = { readonly west: number; readonly south: number; readonly east: number; readonly north: number };

/** The kinds of place a packrafter meets; anything else has no kind. */
export type PlaceKind =
  | "city"
  | "town"
  | "village"
  | "hamlet"
  | "municipality"
  | "district"
  | "province"
  | "region"
  | "river"
  | "stream"
  | "lake"
  | "reservoir"
  | "weir"
  | "dam"
  | "bridge"
  | "road"
  | "address"
  | "car-park"
  | "campsite"
  | "peak";

/** One search result: a short label, a context line to tell results apart, where it is and how far it spreads. */
export type SearchResult = {
  readonly label: string;
  readonly kind?: PlaceKind;
  readonly addressLine?: string;
  readonly at: LatLng;
  readonly box?: SearchArea;
};

/** "Nothing found" is `found` with an empty list; `failed` means ask again later. */
export type PlaceSearchAnswer =
  | { readonly status: "found"; readonly results: readonly SearchResult[] }
  | { readonly status: "failed" };

/**
 * Searches places by text, ranking those in `area` first. The real
 * implementation (the Nominatim adapter) is injected; tests pass a fake.
 * Implementations never throw: a failure is a `failed` answer.
 */
export interface PlaceSearchSource {
  search(text: string, area: SearchArea): Promise<PlaceSearchAnswer>;
}
