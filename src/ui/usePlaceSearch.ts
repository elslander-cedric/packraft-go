// Place search (#173, ADR 0030): runs the core's search reducer and sends each
// search to the page's shared Nominatim client (shared with default names, one
// lazy import). Kept apart from the planner session: trip actions never touch it.
import { useEffect, useReducer, useRef } from "react";
import {
  firstPlaceSearch,
  placeSearch,
  searchToSend,
  type PlaceSearchAnswer,
  type SearchArea,
  type SearchResult,
} from "@/core/placeSearch";
import { sharedNominatim } from "./sharedNominatim";

/** Until the map reports what it shows: anywhere, ranked as Nominatim likes. */
const WHOLE_WORLD: SearchArea = { west: -180, south: -90, east: 180, north: 90 };

const FAILED: PlaceSearchAnswer = { status: "failed" };

const online = () => typeof navigator === "undefined" || navigator.onLine;

export function usePlaceSearch() {
  const [state, dispatch] = useReducer(placeSearch, firstPlaceSearch);
  // The visible map, updated as it moves; read when a search is submitted.
  const area = useRef<SearchArea>(WHOLE_WORLD);
  const sending = searchToSend(state);

  useEffect(() => {
    if (!sending) return;
    const { id, text, area } = sending;
    void sharedNominatim()
      .then(({ search }) => search.search(text, area))
      // The client never throws, but its lazy import can fail (offline, a new deploy).
      .catch(() => FAILED)
      .then((answer) => dispatch({ type: "answer", id, answer }));
  }, [sending]);

  return {
    state,
    /** The map moved: searches rank places in this area first. */
    setArea: (visible: SearchArea) => {
      area.current = visible;
    },
    edit: (text: string) => dispatch({ type: "edit", text }),
    submit: () => dispatch({ type: "submit", area: area.current, online: online() }),
    retry: () => dispatch({ type: "retry", online: online() }),
    pick: (result: SearchResult) => dispatch({ type: "pick", result }),
    dismiss: () => dispatch({ type: "dismiss" }),
    clear: () => dispatch({ type: "clear" }),
  };
}

export type PlaceSearch = ReturnType<typeof usePlaceSearch>;
