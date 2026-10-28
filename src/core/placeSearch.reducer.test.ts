// Seam: the place search reducer (#173, ADR 0030). Tests send actions and check
// the state that comes out: what the bar holds, the dropdown's outcome, the
// shown search result and the request to send. It is not part of the planner
// session (ADR 0025); the e2e test shows trip actions leave it alone.
import { describe, expect, it } from "vitest";
import {
  firstPlaceSearch,
  placeSearch,
  searchToSend,
  type PlaceSearchAction,
  type PlaceSearchState,
  type SearchArea,
  type SearchResult,
} from "./placeSearch";

const HOTTON_AREA: SearchArea = { west: 5.35, south: 50.22, east: 5.55, north: 50.32 };
const LIEGE_AREA: SearchArea = { west: 5.4, south: 50.5, east: 5.7, north: 50.7 };
const hotton: SearchResult = {
  label: "Hotton",
  kind: "village",
  addressLine: "Hotton, Luxembourg",
  at: { lat: 50.2675, lng: 5.4469 },
  box: { west: 5.4, south: 50.25, east: 5.49, north: 50.29 },
};
const melreux: SearchResult = { label: "Melreux", kind: "village", at: { lat: 50.2832, lng: 5.4377 } };

const run = (state: PlaceSearchState, ...actions: PlaceSearchAction[]) => actions.reduce(placeSearch, state);
const typed = (text: string) => run(firstPlaceSearch, { type: "edit", text });
const submit = (online = true): PlaceSearchAction => ({ type: "submit", area: HOTTON_AREA, online });
/** The answer to the request being sent now. */
const answer = (state: PlaceSearchState, results: SearchResult[] | "failed") =>
  placeSearch(state, {
    type: "answer",
    id: searchToSend(state)!.id,
    answer: results === "failed" ? { status: "failed" } : { status: "found", results },
  });

const searching = () => run(typed("hotton"), submit());
const withResults = () => answer(searching(), [hotton, melreux]);
const showing = () => run(withResults(), { type: "pick", result: hotton });
const failed = () => answer(searching(), "failed");
const offline = () => run(typed("hotton"), submit(false));

describe("place search: each state", () => {
  it("starts idle with an empty bar and nothing shown", () => {
    expect(firstPlaceSearch).toMatchObject({ text: "", outcome: { kind: "idle" }, shown: null });
    expect(searchToSend(firstPlaceSearch)).toBeNull();
  });

  it.each([
    ["searching", searching, "searching"],
    ["results", withResults, "results"],
    ["nothing found", () => answer(searching(), []), "nothing-found"],
    ["failed", failed, "failed"],
    ["offline", offline, "offline"],
    ["bad coordinates", () => run(typed("95, 5"), submit()), "bad-coordinates"],
    ["showing a result", showing, "idle"],
  ])("%s", (_, make, kind) => {
    expect(make().outcome.kind).toBe(kind);
  });

  it("submitting text sends one search with the text and the visible area", () => {
    expect(searchToSend(searching())).toMatchObject({ text: "hotton", area: HOTTON_AREA });
  });

  it("the results are the answer's, in its order", () => {
    expect(withResults().outcome).toEqual({ kind: "results", results: [hotton, melreux] });
  });

  it("picking a result shows it, puts its label in the bar and closes the list", () => {
    const state = showing();
    expect(state.shown).toEqual(hotton);
    expect(state.text).toBe("Hotton");
    expect(state.outcome).toEqual({ kind: "idle" });
    expect(searchToSend(state)).toBeNull();
  });

  it("only the search being sent is answered: a late answer to an earlier one is ignored", () => {
    const first = searching();
    const firstId = searchToSend(first)!.id;
    const second = run(first, { type: "edit", text: "melreux" }, submit());
    const late = placeSearch(second, { type: "answer", id: firstId, answer: { status: "found", results: [hotton] } });
    expect(late).toBe(second);
  });

  it("an answer after the dropdown was closed is ignored", () => {
    const state = searching();
    const id = searchToSend(state)!.id;
    const closed = placeSearch(state, { type: "dismiss" });
    expect(placeSearch(closed, { type: "answer", id, answer: { status: "found", results: [hotton] } })).toBe(closed);
  });

  it("offline sends nothing", () => {
    expect(searchToSend(offline())).toBeNull();
  });
});

describe("place search: coordinates", () => {
  it("coordinates show their place at once, with no request", () => {
    const state = run(typed(" 50.27N 5.44E "), submit());
    expect(state.shown).toEqual({ label: "50.27N 5.44E", at: { lat: 50.27, lng: 5.44 } });
    expect(state.outcome).toEqual({ kind: "idle" });
    expect(searchToSend(state)).toBeNull();
  });

  it("coordinates work offline", () => {
    expect(run(typed("50.27, 5.44"), submit(false)).shown?.at).toEqual({ lat: 50.27, lng: 5.44 });
  });

  it("bad coordinates send nothing and keep what was shown", () => {
    const state = run(showing(), { type: "edit", text: "95, 5" }, submit());
    expect(state.outcome).toEqual({ kind: "bad-coordinates" });
    expect(state.shown).toEqual(hotton);
    expect(searchToSend(state)).toBeNull();
  });
});

describe("place search: Retry", () => {
  it.each([
    ["after a failure", failed],
    ["after offline", offline],
  ])("%s repeats the same text and area as the first try", (_, make) => {
    // Retry carries no area: the map may have moved since, the search may not.
    const state = run(make(), { type: "retry", online: true });
    expect(state.outcome).toEqual({ kind: "searching" });
    expect(searchToSend(state)).toMatchObject({ text: "hotton", area: HOTTON_AREA });
  });

  it("Retry while still offline stays offline and sends nothing", () => {
    const state = run(failed(), { type: "retry", online: false });
    expect(state.outcome).toEqual({ kind: "offline" });
    expect(searchToSend(state)).toBeNull();
  });

  it("Retry is a new request: the failed one's late answer is ignored", () => {
    const first = searching();
    const firstId = searchToSend(first)!.id;
    const retried = run(answer(first, "failed"), { type: "retry", online: true });
    expect(searchToSend(retried)!.id).not.toBe(firstId);
    expect(placeSearch(retried, { type: "answer", id: firstId, answer: { status: "failed" } })).toBe(retried);
  });

  it("Retry does nothing unless the search failed or was offline", () => {
    const state = withResults();
    expect(placeSearch(state, { type: "retry", online: true })).toBe(state);
  });
});

describe("place search: the shown result", () => {
  // One row per action: what happens to a result already shown.
  it.each<[string, (state: PlaceSearchState) => PlaceSearchState, SearchResult | "kept" | null]>([
    ["typing", (s) => run(s, { type: "edit", text: "melr" }), "kept"],
    ["submitting new text", (s) => run(s, { type: "edit", text: "melreux" }, submit()), "kept"],
    ["new results", (s) => answer(run(s, { type: "edit", text: "melreux" }, submit()), [melreux]), "kept"],
    ["picking a new result", (s) => run(s, { type: "pick", result: melreux }), melreux],
    ["nothing found", (s) => answer(run(s, { type: "edit", text: "qxzv" }, submit()), []), null],
    ["a failed search", (s) => answer(run(s, { type: "edit", text: "melreux" }, submit()), "failed"), "kept"],
    ["offline", (s) => run(s, { type: "edit", text: "melreux" }, submit(false)), "kept"],
    ["Escape", (s) => run(s, { type: "dismiss" }), "kept"],
    ["×", (s) => run(s, { type: "clear" }), null],
  ])("%s", (_, act, expected) => {
    expect(act(showing()).shown).toEqual(expected === "kept" ? hotton : expected);
  });

  it("picking the same result again shows it anew, so the map moves again", () => {
    const first = showing();
    const again = run(first, { type: "edit", text: "hotton" }, submit());
    const picked = run(answer(again, [hotton]), { type: "pick", result: hotton });
    expect(picked.shown).toEqual(hotton);
    expect(picked.shown).not.toBe(first.shown);
  });
});

describe("place search: the bar", () => {
  it("empty text does nothing", () => {
    const state = typed("   ");
    expect(placeSearch(state, submit())).toBe(state);
  });

  it("typing closes the list but not a search on its way", () => {
    expect(run(withResults(), { type: "edit", text: "h" }).outcome).toEqual({ kind: "idle" });
    expect(run(searching(), { type: "edit", text: "h" }).outcome).toEqual({ kind: "searching" });
  });

  it("Escape closes the dropdown and keeps the text", () => {
    const state = run(withResults(), { type: "dismiss" });
    expect(state.outcome).toEqual({ kind: "idle" });
    expect(state.text).toBe("hotton");
  });

  it("× clears the text, the list and the result", () => {
    const state = run(withResults(), { type: "pick", result: hotton }, { type: "edit", text: "x" }, submit(), { type: "clear" });
    expect(state).toMatchObject({ text: "", outcome: { kind: "idle" }, shown: null });
    expect(searchToSend(state)).toBeNull();
  });

  it("each search remembers its own area", () => {
    const state = run(typed("liège"), { type: "submit", area: LIEGE_AREA, online: true });
    expect(searchToSend(state)?.area).toEqual(LIEGE_AREA);
  });
});
