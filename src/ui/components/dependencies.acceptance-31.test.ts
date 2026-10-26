// Acceptance tests for #31 (ADR 0020): Base UI is pinned to an exact
// version and no other UI library is added. Written from the ticket, before
// reading the diff. Checks the manifest, so a library added but not (yet)
// imported is also caught.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));

describe("#31: @base-ui/react dependency", () => {
  it("is a runtime dependency pinned to an exact version (no range)", () => {
    const spec: string = pkg.dependencies["@base-ui/react"];
    expect(spec).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.packages[""].dependencies["@base-ui/react"]).toBe(spec);
    expect(lock.packages["node_modules/@base-ui/react"].version).toBe(spec);
  });

  it("is the only UI component library: runtime dependencies are exactly the known set", () => {
    // Updated: ADR 0021 (#41). fflate (ZIP writer, not a UI library) is allowed for the GPX export.
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ["@base-ui/react", "fflate", "leaflet", "next", "react", "react-dom", "react-leaflet"].sort(),
    );
  });

  it("the deprecated package names are not used", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all).not.toHaveProperty("@base-ui-components/react");
    expect(all).not.toHaveProperty("@mui/base");
  });
});
