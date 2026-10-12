// Acceptance tests for the #26 scope addition (from #31, ADR 0020): the
// dependency boundary uses an allowlist, and native confirm is caught via
// window, globalThis and self. Written by the tester from the ticket.
import { describe, expect, it } from "vitest";
import { findNativeConfirm, packagesImportedBy } from "./dependencyBoundary";

describe("#26 scope: native confirm via the global object", () => {
  it.each([
    ["bare call", `confirm("x");`],
    ["window.confirm", `window.confirm("x");`],
    ["globalThis.confirm", `globalThis.confirm("x");`],
    ["self.confirm", `self.confirm("x");`],
    ["window['confirm'] (single quotes)", `window['confirm']("x");`],
    ["globalThis[`confirm`]", "globalThis[`confirm`](\"x\");"],
    ["self.confirm stored then called", `const ask = self.confirm; ask("x");`],
    ["inside JSX handler", `const A = () => <button onClick={() => window.confirm("x") && go()} />;`],
  ])("finds %s", (_, code) => {
    expect(findNativeConfirm(code).length).toBeGreaterThan(0);
  });

  it("ignores our own confirm wrappers and strings", () => {
    expect(findNativeConfirm(`onConfirm(); dialog.confirm(); const s = strings.confirmTitle; <ConfirmDialog />;`)).toEqual([]);
  });
});

describe("#26 scope: imports are reduced to package names for the allowlist", () => {
  it("reports a non-allowlisted library by package name, including subpaths and type imports", () => {
    expect(packagesImportedBy(`import { Box } from "@chakra-ui/react";`)).toEqual(["@chakra-ui/react"]);
    expect(packagesImportedBy(`import Button from "@mui/material/Button";`)).toEqual(["@mui/material"]);
    expect(packagesImportedBy(`import type { X } from "lodash/fp";`)).toEqual(["lodash"]);
    expect(packagesImportedBy(`const m = await import("moment");`)).toEqual(["moment"]);
    expect(packagesImportedBy(`export * from "zustand";`)).toEqual(["zustand"]);
    expect(packagesImportedBy(`import "@radix-ui/themes/styles.css";`)).toEqual(["@radix-ui/themes"]);
  });

  it("ignores project-local imports", () => {
    expect(packagesImportedBy(`import a from "./a"; import b from "../b"; import c from "@/core/c";`)).toEqual([]);
  });
});
