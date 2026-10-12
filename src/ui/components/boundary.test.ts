// #31 / ADR 0020: Base UI is only used through the thin wrappers in
// src/ui/components/, so it can be swapped later without touching screens.
// Native confirm dialogs are gone: confirmations are in-page Alert Dialogs.
// #26: app code may only use an allowlist of runtime packages, and the
// checks parse the code instead of matching it with regular expressions.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findNativeConfirm, packagesImportedBy } from "@/testing/dependencyBoundary";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.resolve(__dirname, "../..");
const WRAPPERS = path.resolve(__dirname);
/** Test-only helpers, never bundled into the app (see CLAUDE.md). */
const TEST_ONLY = [path.join(SRC, "testing"), path.join(SRC, "core", "testing")];

/**
 * The runtime packages app code may import. Adding one is a decision (an ADR
 * or an approved ticket), not a side effect: e.g. another UI library would
 * break ADR 0020.
 */
const ALLOWED_RUNTIME_PACKAGES = [
  "@base-ui/react", // ADR 0020
  "fflate", // ZIP for the GPX export, ADR 0021
  "leaflet", // ADR 0014
  "next", // ADR 0015
  "react",
  "react-dom",
  "react-leaflet", // ADR 0014
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const sources = sourceFiles(SRC).map((file) => {
  const code = readFileSync(file, "utf8");
  return { file, relative: path.relative(SRC, file), code, packages: packagesImportedBy(code) };
});
const appSources = sources.filter(({ file }) => !TEST_ONLY.some((dir) => file.startsWith(dir + path.sep)));
const isWrapper = (file: string) => file.startsWith(WRAPPERS + path.sep);

describe("Base UI boundary", () => {
  it("only the wrappers in src/ui/components import Base UI", () => {
    const offenders = sources
      .filter(({ file }) => !isWrapper(file))
      .flatMap(({ relative, packages }) =>
        packages.filter((name) => /^@base-ui(-components)?\//.test(name)).map((name) => `${relative}: ${name}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the wrappers do import Base UI", () => {
    const wrappers = sources.filter(({ file }) => isWrapper(file));
    expect(wrappers.some(({ packages }) => packages.includes("@base-ui/react"))).toBe(true);
  });
});

describe("runtime dependencies", () => {
  it("app code imports only allowed runtime packages", () => {
    expect(appSources.length).toBeGreaterThan(0);
    const offenders = appSources.flatMap(({ relative, packages }) =>
      packages.filter((name) => !ALLOWED_RUNTIME_PACKAGES.includes(name)).map((name) => `${relative}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it("package.json lists only allowed runtime packages", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const unexpected = Object.keys(pkg.dependencies).filter((name) => !ALLOWED_RUNTIME_PACKAGES.includes(name));
    expect(unexpected).toEqual([]);
  });
});

describe("confirmations", () => {
  it("no native confirm dialog is left in the app", () => {
    const offenders = appSources.flatMap(({ relative, code }) =>
      findNativeConfirm(code).map((finding) => `${relative}: ${finding}`),
    );
    expect(offenders).toEqual([]);
  });
});
