// The trip planner core is pure TypeScript: no React, no network (spec #2).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function coreSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return coreSources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const sources = coreSources(__dirname).map((file) => ({
  file: path.relative(__dirname, file),
  code: readFileSync(file, "utf8"),
}));

describe("trip planner core", () => {
  it("only imports other core modules", () => {
    expect(sources.length).toBeGreaterThan(0);
    const external = sources.flatMap(({ file, code }) =>
      [...code.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)]
        .map((m) => m[1] ?? m[2])
        .filter((spec) => !spec.startsWith("./") && !spec.startsWith("../"))
        .map((spec) => `${file}: ${spec}`),
    );
    expect(external).toEqual([]);
  });

  it("contains no JSX and makes no network calls", () => {
    const offenders = sources
      .filter(({ file, code }) => file.endsWith(".tsx") || /\b(fetch|XMLHttpRequest|WebSocket)\b/.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
