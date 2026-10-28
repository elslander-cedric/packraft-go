// PROTOTYPE (place search UI, #169): throwaway, never merged. In-memory only.

import { useRef, useState } from "react";
import { parseCoordinates, stubSearch, type PrototypeResult } from "./stub";

export type SearchStatus =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; results: PrototypeResult[] }
  | { kind: "nothing" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "bad-coordinates"; message: string };

export type PlaceSearch = ReturnType<typeof usePlaceSearchPrototype>;

export function usePlaceSearchPrototype() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>({ kind: "idle" });
  const [shown, setShown] = useState<PrototypeResult | null>(null);
  // A new object every time a result is picked, so the map moves again for the same result.
  const [shownSeq, setShownSeq] = useState(0);
  // Answers kept for the session: the same text is never sent twice (only failures are retried).
  const answers = useRef(new Map<string, PrototypeResult[]>());
  const asked = useRef("");

  const show = (result: PrototypeResult) => {
    setShown(result);
    setShownSeq((n) => n + 1);
    setStatus({ kind: "idle" });
  };

  const run = async (text: string) => {
    asked.current = text;
    const key = text.trim().toLowerCase();
    const kept = answers.current.get(key);
    if (kept) {
      setStatus(kept.length ? { kind: "results", results: kept } : { kind: "nothing" });
      return;
    }
    setStatus({ kind: "searching" });
    const answer = await stubSearch(text);
    if (asked.current !== text) return;
    if (answer.kind !== "results") {
      setStatus({ kind: answer.kind });
      return;
    }
    answers.current.set(key, answer.results);
    setStatus(answer.results.length ? { kind: "results", results: answer.results } : { kind: "nothing" });
  };

  /** Search for what's typed. Coordinates jump straight there, with no request. */
  const submit = () => {
    const text = query.trim();
    if (!text) return;
    const coords = parseCoordinates(text);
    if (coords?.kind === "coordinates") return show(coords.result);
    if (coords?.kind === "bad-coordinates") return setStatus(coords);
    void run(text);
  };

  return {
    query,
    setQuery,
    status,
    submit,
    retry: () => void run(asked.current),
    pick: show,
    shown,
    shownSeq,
    /** Close the result list, keep the marker. */
    dismiss: () => setStatus({ kind: "idle" }),
    /** Remove the marker (and the text). */
    clear: () => {
      setShown(null);
      setQuery("");
      setStatus({ kind: "idle" });
    },
  };
}
