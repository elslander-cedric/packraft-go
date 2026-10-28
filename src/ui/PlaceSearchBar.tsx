"use client";

import type { SearchOutcome, SearchResult } from "@/core/placeSearch";
import { SearchBox, type SearchBoxMessage } from "./components/SearchBox";
import { Icon } from "./icons/Icon";
import { icons } from "./icons/icons";
import { strings } from "./strings";
import type { PlaceSearch } from "./usePlaceSearch";
import "./PlaceSearchBar.css";

const text = strings.placeSearch;

/** The dropdown's message for an outcome, or null when it shows results or is closed. */
function messageFor(outcome: SearchOutcome, asked: string, retry: () => void): SearchBoxMessage | null {
  const retryAction = { label: text.retry, onAction: retry };
  switch (outcome.kind) {
    case "idle":
    case "results":
      return null;
    case "searching":
      return { role: "status", text: text.searching };
    case "nothing-found":
      return { role: "status", text: text.nothingFound(asked) };
    case "failed":
      return { role: "alert", text: text.failed, action: retryAction };
    case "offline":
      return { role: "alert", text: text.offline, action: retryAction };
    case "bad-coordinates":
      return { role: "alert", text: text.badCoordinates };
  }
}

/** Place search over the map (#173): the bar, its results and messages. The map draws the shown result. */
export default function PlaceSearchBar({ search, className }: { search: PlaceSearch; className?: string }) {
  const { state } = search;
  const results = state.outcome.kind === "results" ? state.outcome.results : [];

  return (
    <SearchBox<SearchResult>
      className={className}
      label={text.label}
      placeholder={text.placeholder}
      searchLabel={text.search}
      searchIcon={<Icon icon={icons.search} />}
      clearLabel={text.clear}
      clearIcon={<Icon icon={icons.clearSearch} />}
      value={state.text}
      onValueChange={search.edit}
      onSubmit={search.submit}
      onClear={search.clear}
      items={results}
      itemKey={(result, index) => `${index}:${result.label}`}
      renderItem={(result) => (
        <>
          <span className="place-search-label">
            {result.label}
            {result.kind && <span className="place-search-kind"> {text.kinds[result.kind]}</span>}
          </span>
          {result.addressLine && <span className="place-search-address">{result.addressLine}</span>}
        </>
      )}
      onPick={search.pick}
      itemsLabel={text.resultsLabel}
      message={messageFor(state.outcome, state.asked?.text ?? "", search.retry)}
      onDismiss={search.dismiss}
    />
  );
}
