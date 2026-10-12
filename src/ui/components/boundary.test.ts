// #31 / ADR 0020: Base UI is only used through the thin wrappers in
// src/ui/components/, so it can be swapped later without touching screens.
// Native confirm dialogs are gone: confirmations are in-page Alert Dialogs.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const WRAPPERS = path.resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const sources = sourceFiles(SRC).map((file) => ({
  file,
  relative: path.relative(SRC, file),
  code: readFileSync(file, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""),
}));

const importsOf = (code: string) =>
  [...code.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );

describe("Base UI boundary", () => {
  it("only the wrappers in src/ui/components import Base UI", () => {
    const offenders = sources
      .filter(({ file }) => !file.startsWith(WRAPPERS + path.sep))
      .flatMap(({ relative, code }) =>
        importsOf(code)
          .filter((spec) => /^@base-ui(-components)?\//.test(spec))
          .map((spec) => `${relative}: ${spec}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the wrappers do import Base UI", () => {
    const wrappers = sources.filter(({ file }) => file.startsWith(WRAPPERS + path.sep));
    expect(wrappers.some(({ code }) => importsOf(code).some((spec) => spec.startsWith("@base-ui/react/")))).toBe(true);
  });

  it("no other UI component library is imported", () => {
    const offenders = sources.flatMap(({ relative, code }) =>
      importsOf(code)
        .filter((spec) => /^(@mui\/|@base-ui-components\/|@radix-ui\/|@headlessui\/|react-aria)/.test(spec))
        .map((spec) => `${relative}: ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("confirmations", () => {
  it("no native window.confirm is left in the app", () => {
    const offenders = sources
      .filter(({ code }) => /\bwindow\.confirm\b|(?<![\w.])confirm\s*\(/.test(code))
      .map(({ relative }) => relative);
    expect(offenders).toEqual([]);
  });
});
