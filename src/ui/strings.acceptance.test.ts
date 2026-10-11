// Acceptance tests for #12: user-facing strings live in a single module
// (ADR 0013) and Belgium is only targeted by the initial map view (ADR 0004).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { strings } from "./strings";

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const components = sourceFiles(SRC).filter((f) => f.endsWith(".tsx"));

describe("strings module", () => {
  it("exports the texts the skeleton shows", () => {
    expect(strings.navigationRulesNotice).toMatch(/check local navigation rules/i);
    expect(strings.mapAttribution).toContain("OpenStreetMap");
    expect(strings.mapAttribution).toContain("OpenTopoMap");
    expect(strings.mapAttribution).toContain("BRouter");
  });

  it("components contain no hard-coded visible text", () => {
    expect(components.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of components) {
      const src = readFileSync(file, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      // Text between JSX tags, e.g. <p>Hello</p>.
      for (const m of src.matchAll(/>\s*([^<>{}\s][^<>{}]*?)\s*</g)) {
        if (/[A-Za-z]/.test(m[1]) && !/=>|&&|\|\|/.test(m[1])) {
          offenders.push(`${path.relative(SRC, file)}: "${m[1]}"`);
        }
      }
      // Literal accessible/visible attributes.
      for (const m of src.matchAll(/\b(aria-label|title|alt|placeholder)="([^"]+)"/g)) {
        offenders.push(`${path.relative(SRC, file)}: ${m[1]}="${m[2]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no Belgium hard-coding outside the map config", () => {
  it("only mapConfig mentions Belgium", () => {
    const hits = sourceFiles(SRC)
      .filter((f) => !f.endsWith(path.join("map", "mapConfig.ts")))
      .filter((f) => !f.endsWith(path.join("ui", "strings.ts")))
      .filter((f) => /belgi/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
