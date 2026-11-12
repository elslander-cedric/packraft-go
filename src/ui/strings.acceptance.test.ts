// User-facing strings live in a single module, and Belgium is only targeted by the initial map view.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { strings } from "./strings";

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("strings module", () => {
  it("exports the texts the skeleton shows", () => {
    expect(strings.navigationRulesNotice).toMatch(/indicative only.*checking local rules/i);
    expect(strings.mapAttribution).toContain("OpenStreetMap");
    expect(strings.mapAttribution).toContain("OpenTopoMap");
    expect(strings.mapAttribution).toContain("BRouter");
  });
});

describe("no Belgium hard-coding outside the map config", () => {
  it("only mapConfig mentions Belgium", () => {
    const hits = sourceFiles(SRC)
      .filter((sourceFile) => !sourceFile.endsWith(path.join("map", "mapConfig.ts")))
      .filter((file) => !file.endsWith(path.join("ui", "strings.ts")))
      .filter((file) => /belgi/i.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });
});
