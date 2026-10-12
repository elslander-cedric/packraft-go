// Unit tests for the hard-coded text checker (#26, ADR 0013): it must catch
// user-facing text written in JSX and ignore ordinary TypeScript code.
import { describe, expect, it } from "vitest";
import { findHardCodedText } from "./hardCodedText";

describe("findHardCodedText: code that is not user-facing text", () => {
  it("ignores a generic call followed by JSX", () => {
    const code = `
      export function Picker() {
        const input = useRef<HTMLInputElement>(null);
        return <input ref={input} />;
      }`;
    expect(findHardCodedText(code)).toEqual([]);
  });

  it("ignores arrow functions and comparisons between generics and JSX", () => {
    const code = `
      export function List({ items }: { items: Item[] }) {
        const first = useState<number | null>(null);
        const pick = (i: number) => setPicked(items.length > i ? i : null);
        const ok = items.filter((item) => item.size > 2).length < 3;
        return (
          <ul onClick={() => pick(0)}>
            {items.map((item) => <li key={item.id}>{item.label}</li>)}
          </ul>
        );
      }`;
    expect(findHardCodedText(code)).toEqual([]);
  });

  it("ignores repeated generic type annotations next to each other", () => {
    const code = `
      type Props = {
        newTripButtonRef?: Ref<HTMLButtonElement>;
        openFileButtonRef?: Ref<HTMLButtonElement>;
      };
      const A = ({ newTripButtonRef }: Props) => <button ref={newTripButtonRef} />;`;
    expect(findHardCodedText(code)).toEqual([]);
  });

  it("ignores strings that are not shown: class names, keys, comparisons", () => {
    const code = `
      const A = ({ mode }) => (
        <div className="trip name" data-mode={mode === "hike" ? "on foot" : "on water"}>
          {mode === "paddle" && <span className={\`leg \${mode}\`} />}
        </div>
      );`;
    expect(findHardCodedText(code)).toEqual([]);
  });

  it("ignores JSX comments, entities and punctuation", () => {
    const code = `const A = ({ a, b }) => <p>{/* Hello there */}{a}&nbsp;&middot;&nbsp;{b} – / ({a})</p>;`;
    expect(findHardCodedText(code)).toEqual([]);
  });

  it("ignores text in ordinary comments", () => {
    const code = `
      // Hello <b>there</b>
      /* <p>Hello</p> */
      const A = () => <p />;`;
    expect(findHardCodedText(code)).toEqual([]);
  });
});

describe("findHardCodedText: seeded hard-coded text", () => {
  it("finds a text node between tags", () => {
    expect(findHardCodedText(`const A = () => <p>Hello there</p>;`)).toEqual(['text "Hello there"']);
  });

  it.each(["title", "aria-label", "placeholder", "alt"])("finds a literal %s attribute", (attribute) => {
    expect(findHardCodedText(`const A = () => <input ${attribute}="Trip name" />;`)).toEqual([
      `${attribute}="Trip name"`,
    ]);
  });

  it("finds a string literal rendered as a child expression", () => {
    expect(findHardCodedText(`const A = () => <p>{"Hello there"}</p>;`)).toEqual(['text "Hello there"']);
  });

  it("finds text inside a fragment", () => {
    expect(findHardCodedText(`const A = () => <>Hello {"there"}</>;`)).toEqual(['text "Hello"', 'text "there"']);
  });

  it("finds the text part of a template literal rendered as a child", () => {
    expect(findHardCodedText("const A = ({ n }) => <p>{`${n} legs`}</p>;")).toEqual(['text " legs"']);
  });

  it("finds strings in the branches of a rendered condition", () => {
    expect(findHardCodedText(`const A = ({ ok }) => <p>{ok ? "Saved" : error ?? "Failed"}{ok && "Done"}</p>;`)).toEqual([
      'text "Saved"',
      'text "Failed"',
      'text "Done"',
    ]);
  });

  it("finds a string literal in a visible attribute expression", () => {
    expect(findHardCodedText(`const A = ({ label }) => <nav aria-label={label ?? "Trip actions"} />;`)).toEqual([
      'aria-label="Trip actions"',
    ]);
  });
});
