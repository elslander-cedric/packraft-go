// Acceptance tests for #26 (ADR 0013): the hard-coded text check ignores code
// and still catches real user-facing text in JSX. Written from
// the ticket, independent of the unit tests.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findHardCodedText } from "./hardCodedText";

const UI = path.resolve(__dirname, "../ui");

describe("#26 AC1: ignores TypeScript generics, arrow functions and other non-text syntax", () => {
  it.each([
    ["useRef generic before JSX", `const A = () => { const r = useRef<HTMLButtonElement>(null); return <button ref={r} />; };`],
    ["useState union generic", `const A = () => { const [t] = useState<Trip | null>(null); return <p>{t?.name}</p>; };`],
    ["generic arrow function", `const id = <T,>(x: T) => x; const A = () => <p>{id(1)}</p>;`],
    ["generic function with extends", `function f<T extends { a: string }>(x: T): Array<T> { return [x]; } const A = () => <i />;`],
    ["arrow functions in props and children", `const A = ({ xs }) => <ul onClick={() => go()}>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;`],
    ["comparisons and logical operators", `const A = ({ a, b }) => <p>{a > b && b < 3 ? a : b}{a >= 1 || b <= 2}</p>;`],
    ["template literal class names", "const A = ({ mode }) => <div className={`leg leg--${mode} is-active`} />;"],
    ["string literals in non-visible attributes", `const A = () => <input type="text" name="trip" id="trip-name" role="toolbar" data-testid="Trip name" />;`],
    ["strings in conditions only", `const A = ({ m }) => <p>{m === "hike" ? strings.hike : strings.paddle}</p>;`],
    ["keys and style objects", `const A = () => <div key="row" style={{ display: "flex", gap: "4px" }} />;`],
    ["satisfies / as casts", `const x = { a: 1 } as const satisfies Record<string, number>; const A = () => <p>{x.a}</p>;`],
    ["a strings-module reference everywhere", `const A = () => <input title={strings.t} aria-label={strings.l} placeholder={strings.p} />;`],
    ["numbers, units-free punctuation and entities", `const A = ({ n }) => <p>{n} &middot; ({n}) — 42 / 7 %</p>;`],
  ])("%s", (_, code) => {
    expect(findHardCodedText(code)).toEqual([]);
  });
});

describe("#26 AC2: still fails on real hard-coded user-facing text in JSX", () => {
  it.each([
    ["a text node", `const A = () => <h1>Plan a trip</h1>;`],
    ["a text node next to an expression", `const A = ({ n }) => <p>{n} km</p>;`],
    ["a text node in a fragment", `const A = () => <>Saved</>;`],
    ["a text node after a generic", `const A = () => { const r = useRef<HTMLDivElement>(null); return <div ref={r}>Hello</div>; };`],
    ["title", `const A = () => <button title="Delete point" />;`],
    ["aria-label", `const A = () => <nav aria-label="Trip actions" />;`],
    ["placeholder", `const A = () => <input placeholder="Trip name" />;`],
    ["alt", `const A = () => <img alt="Map preview" src="/x.png" />;`],
    ["label", `const A = () => <Toolbar label="Edit tools" />;`],
    ["title in braces", `const A = () => <button title={"Delete point"} />;`],
    ["aria-label from a template", "const A = ({ n }) => <button aria-label={`Remove ${n}`} />;"],
    ["string child", `const A = () => <p>{"Loading"}</p>;`],
    ["ternary child", `const A = ({ ok }) => <p>{ok ? strings.ok : "Something failed"}</p>;`],
    ["&& child", `const A = ({ busy }) => <p>{busy && "Routing…"}</p>;`],
  ])("%s", (_, code) => {
    expect(findHardCodedText(code).length).toBeGreaterThan(0);
  });
});

describe("#26 AC4: code rearranged to dodge the old check is restored", () => {
  const read = (file: string) => readFileSync(path.join(UI, file), "utf8");

  // Updated: the files rearranged then (TripPlanner, TripToolbar, the Toolbar wrapper) went with
  // the desktop layout (#191, ADR 0034); the planner's own files are checked instead.
  it("the planner uses natural generics for refs", () => {
    const code = read("planner/PlaceSearch.tsx");
    expect(code).toContain("useRef<HTMLButtonElement>(null)");
    expect(code).not.toMatch(/null as [A-Z]/);
  });

  it("the real UI files pass the checker", () => {
    for (const file of ["planner/Planner.tsx", "planner/PlaceSearch.tsx", "components/Button.tsx"]) {
      expect(findHardCodedText(read(file))).toEqual([]);
    }
  });
});
