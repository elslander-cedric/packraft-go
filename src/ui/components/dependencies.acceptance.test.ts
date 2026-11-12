// Base UI is pinned to an exact version (ADR 0020), under its current package name.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));

describe("@base-ui/react dependency", () => {
  it("is a runtime dependency pinned to an exact version (no range)", () => {
    const spec: string = pkg.dependencies["@base-ui/react"];
    expect(spec).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.packages[""].dependencies["@base-ui/react"]).toBe(spec);
    expect(lock.packages["node_modules/@base-ui/react"].version).toBe(spec);
  });

  it("the deprecated package names are not used", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all).not.toHaveProperty("@base-ui-components/react");
    expect(all).not.toHaveProperty("@mui/base");
  });
});
