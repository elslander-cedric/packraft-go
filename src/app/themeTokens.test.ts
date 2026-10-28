import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DARK_THEME_COLOR } from "./manifest";

// The dark theme (#141) follows the system's prefers-color-scheme: the panel tokens in
// globals.css get dark values, the overlay tokens keep theirs.
const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

function declarations(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const light = declarations(css.match(/\n:root \{([^}]*)\}/)?.[1] ?? "");
const darkOnly = declarations(
  css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? "",
);
const dark = { ...light, ...darkOnly };

function luminance(hex: string): number {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Foreground on background, as the stylesheets pair them.
const pairs: [string, string][] = [
  ["--color-text", "--color-surface"],
  ["--color-muted", "--color-surface"],
  ["--color-danger", "--color-surface"],
  ["--color-link", "--color-surface"],
  ["--color-warning", "--color-surface"],
  ["--color-text", "--color-surface-hover"],
  ["--color-muted", "--color-surface-hover"],
  ["--color-danger", "--color-surface-hover"],
  ["--color-text", "--color-paddle-tint"],
  ["--color-muted", "--color-paddle-tint"],
  ["--color-danger", "--color-paddle-tint"],
  ["--color-text", "--color-notice"],
  // Tooltips and the pressed toggle invert the surface and the text.
  ["--color-surface", "--color-text"],
  ["--color-on-danger", "--color-danger"],
  ["--color-on-danger", "--color-danger-hover"],
  ["--color-on-accent", "--color-hike"],
  ["--color-on-accent", "--color-paddle"],
  ["--color-on-accent", "--color-camp"],
  // A dialog's filled main and destructive buttons (white text in both themes).
  ["--color-on-accent", "--color-primary"],
  ["--color-on-accent", "--color-primary-hover"],
  ["--color-on-accent", "--color-danger-fill"],
  ["--color-on-accent", "--color-danger-fill-hover"],
];

describe("theme tokens (#141)", () => {
  it("has a dark surface under prefers-color-scheme: dark, and a light one otherwise", () => {
    expect(luminance(light["--color-surface"])).toBeGreaterThan(0.9);
    expect(luminance(dark["--color-surface"])).toBeLessThan(0.05);
  });

  for (const [themeName, theme] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it.each(pairs)(`${themeName}: %s on %s reaches WCAG AA (4.5:1)`, (fg, bg) => {
      expect(theme[fg], fg).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(theme[bg], bg).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  // The accent is never text: underlines, outlines and switch fills need 3:1 (WCAG 1.4.11).
  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s: the accent stands out from the surface (3:1)", (_, theme) => {
    expect(contrast(theme["--color-focus"], theme["--color-surface"])).toBeGreaterThanOrEqual(3);
  });

  it("uses the paddle button's blue as the accent in both themes", () => {
    expect(light["--color-focus"]).toBe(light["--color-paddle"]);
    expect(dark["--color-focus"]).toBe(light["--color-paddle"]);
  });

  it("colours the phone's status bar like the dark surface", () => {
    expect(DARK_THEME_COLOR).toBe(dark["--color-surface"]);
  });

  it("keeps the overlay colours in both themes, so a leg matches its line on the map", () => {
    for (const token of ["--color-hike", "--color-paddle", "--color-camp", "--color-on-accent"]) {
      expect(darkOnly[token], token).toBeUndefined();
    }
  });
});
