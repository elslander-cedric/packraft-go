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

/** What the search text is: coordinates to jump to, coordinates that can't be, or something to search for. */
export type ParsedCoordinates =
  | { readonly kind: "coordinates"; readonly at: LatLng }
  | { readonly kind: "bad-coordinates" }
  | { readonly kind: "not-coordinates" };

/** A decimal number with an optional sign, then an optional hemisphere letter after it. */
const COORDINATE = String.raw`([+-]?\d+(?:\.\d+)?)\s*([NSEW])?`;
/** Two of them, separated by a comma, a semicolon or spaces. */
const COORDINATES = new RegExp(String.raw`^\s*${COORDINATE}\s*(?:[,;]|\s)\s*${COORDINATE}\s*$`, "i");

/** Two numbers written with decimal commas, which aren't supported. */
const DECIMAL_COMMAS = /^\s*[+-]?\d+,\d+\s*[NSEW]?\s*(?:;|\s)\s*[+-]?\d+,\d+\s*[NSEW]?\s*$/i;

/**
 * Coordinates typed in the search bar (#173, ADR 0030): decimal degrees,
 * latitude first ("50.27, 5.44"), or in either order with N/S/E/W after each
 * number ("50.27N 5.44E"). No degrees-minutes-seconds and no decimal commas.
 * Two numbers that can't be a position (out of range, a sign and a letter,
 * two letters for the same axis, decimal commas) are bad coordinates; anything else is text to search.
 */
export function parseCoordinates(text: string): ParsedCoordinates {
  const bad = { kind: "bad-coordinates" } as const;
  // "50,27 5,44" is plainly meant as coordinates, so it is never sent as a search.
  if (DECIMAL_COMMAS.test(text)) return bad;
  const match = COORDINATES.exec(text);
  if (!match) return { kind: "not-coordinates" };
  const [, firstNumber, firstLetter, secondNumber, secondLetter] = match;
  const first = firstLetter?.toUpperCase();
  const second = secondLetter?.toUpperCase();
  const isLongitude = (letter?: string) => letter === "E" || letter === "W";
  const isLatitude = (letter?: string) => letter === "N" || letter === "S";
  if ((first && /^[+-]/.test(firstNumber)) || (second && /^[+-]/.test(secondNumber))) return bad;
  if ((isLatitude(first) && isLatitude(second)) || (isLongitude(first) && isLongitude(second))) return bad;
  // A letter on either number can say the longitude came first.
  const swapped = isLongitude(first) || isLatitude(second);
  const signed = (number: string, letter?: string) => (letter === "S" || letter === "W" ? -1 : 1) * Number(number);
  const [lat, lng] = swapped
    ? [signed(secondNumber, second), signed(firstNumber, first)]
    : [signed(firstNumber, first), signed(secondNumber, second)];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return bad;
  return { kind: "coordinates", at: { lat, lng } };
}

/** What the search bar's dropdown shows. "idle" is closed. */
export type SearchOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "results"; readonly results: readonly SearchResult[] }
  | { readonly kind: "nothing-found" }
  | { readonly kind: "failed" }
  | { readonly kind: "offline" }
  | { readonly kind: "bad-coordinates" };

/** One search as asked: Retry repeats its text and area. `id` tells its answer from a late one. */
export type SearchAsked = { readonly id: number; readonly text: string; readonly area: SearchArea };

/**
 * The place search state (#173, ADR 0030): what the bar holds, its dropdown, the
 * shown search result and the last search asked. It is about the map, not the
 * trip, so it is not part of the planner session (ADR 0025).
 */
export type PlaceSearchState = {
  readonly text: string;
  readonly outcome: SearchOutcome;
  /** The search result on the map; a new object every time one is picked, so the map moves again. */
  readonly shown: SearchResult | null;
  readonly asked: SearchAsked | null;
};

export type PlaceSearchAction =
  /** The text in the bar changed. */
  | { type: "edit"; text: string }
  /** Enter or the magnifier: `area` is the visible map, `online` is the browser's word for it. */
  | { type: "submit"; area: SearchArea; online: boolean }
  /** The source answered search `id`. */
  | { type: "answer"; id: number; answer: PlaceSearchAnswer }
  | { type: "retry"; online: boolean }
  | { type: "pick"; result: SearchResult }
  /** Escape or a click elsewhere: close the dropdown only. */
  | { type: "dismiss" }
  /** ×: clear the text, the list and the result. */
  | { type: "clear" };

export const firstPlaceSearch: PlaceSearchState = { text: "", outcome: { kind: "idle" }, shown: null, asked: null };

const IDLE: SearchOutcome = { kind: "idle" };

/** Asks `text` in `area` again, or for the first time: online it is a new request, offline nothing is sent. */
function ask(state: PlaceSearchState, text: string, area: SearchArea, online: boolean): PlaceSearchState {
  const asked = { id: (state.asked?.id ?? 0) + 1, text, area };
  return { ...state, asked, outcome: { kind: online ? "searching" : "offline" } };
}

export function placeSearch(state: PlaceSearchState, action: PlaceSearchAction): PlaceSearchState {
  switch (action.type) {
    case "edit":
      // Typing closes the list, which belongs to the text it was for; a search on its way still lands.
      return { ...state, text: action.text, outcome: state.outcome.kind === "searching" ? state.outcome : IDLE };
    case "submit": {
      const text = state.text.trim();
      if (!text) return state;
      const coordinates = parseCoordinates(text);
      if (coordinates.kind === "coordinates") return { ...state, outcome: IDLE, shown: { label: text, at: coordinates.at } };
      if (coordinates.kind === "bad-coordinates") return { ...state, outcome: { kind: "bad-coordinates" } };
      return ask(state, text, action.area, action.online);
    }
    case "answer": {
      if (state.outcome.kind !== "searching" || state.asked?.id !== action.id) return state;
      if (action.answer.status === "failed") return { ...state, outcome: { kind: "failed" } };
      const { results } = action.answer;
      // Nothing found for the new text: the old result no longer matches what you asked.
      if (results.length === 0) return { ...state, outcome: { kind: "nothing-found" }, shown: null };
      return { ...state, outcome: { kind: "results", results } };
    }
    case "retry":
      if ((state.outcome.kind !== "failed" && state.outcome.kind !== "offline") || !state.asked) return state;
      return ask(state, state.asked.text, state.asked.area, action.online);
    case "pick":
      return { ...state, text: action.result.label, outcome: IDLE, shown: { ...action.result } };
    case "dismiss":
      return state.outcome.kind === "idle" ? state : { ...state, outcome: IDLE };
    case "clear":
      return { ...state, text: "", outcome: IDLE, shown: null };
  }
}

/** The search to send now, or null: there is one while the dropdown says searching. */
export function searchToSend(state: PlaceSearchState): SearchAsked | null {
  return state.outcome.kind === "searching" ? state.asked : null;
}
