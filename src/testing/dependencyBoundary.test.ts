// Unit tests for the dependency boundary checks (#26, from #31 / ADR 0020).
import { describe, expect, it } from "vitest";
import { findNativeConfirm, packagesImportedBy } from "./dependencyBoundary";

describe("findNativeConfirm: seeded uses of the browser's confirm dialog", () => {
  it.each([
    ["a bare call", `if (confirm("Discard?")) reset();`, "confirm("],
    ["window.confirm", `if (window.confirm("Discard?")) reset();`, "window.confirm"],
    ["globalThis.confirm", `if (globalThis.confirm("Discard?")) reset();`, "globalThis.confirm"],
    ["self.confirm", `if (self.confirm("Discard?")) reset();`, "self.confirm"],
    ["window['confirm']", `if (window["confirm"]("Discard?")) reset();`, "window.confirm"],
    ["optional call", `if (window?.confirm?.("Discard?")) reset();`, "window.confirm"],
    ["a stored reference", `const ask = globalThis.confirm;`, "globalThis.confirm"],
    ["with spacing", `if (confirm  ("Discard?")) reset();`, "confirm("],
  ])("finds %s", (_, code, finding) => {
    expect(findNativeConfirm(code)).toEqual([finding]);
  });
});

describe("findNativeConfirm: code that is not the native dialog", () => {
  it("ignores our own confirm functions, props and methods", () => {
    const code = `
      const confirmReplace = () => applyReplace(next);
      onConfirm();
      dialog.confirm();
      props.onConfirm?.();
      const label = strings.confirmCancel;
      <ConfirmDialog onConfirm={confirmReplace} />;`;
    expect(findNativeConfirm(code)).toEqual([]);
  });

  it("ignores comments and strings that mention confirm(", () => {
    const code = `
      // used instead of the browser's window.confirm("...")
      /* globalThis.confirm( */
      const note = "call confirm( here";`;
    expect(findNativeConfirm(code)).toEqual([]);
  });
});

describe("packagesImportedBy", () => {
  it("names the package of every bare import, re-export and dynamic import", () => {
    const code = `
      import { Toolbar } from "@base-ui/react/toolbar";
      import L from "leaflet";
      import "leaflet/dist/leaflet.css";
      import type { Theme } from "@chakra-ui/react";
      export { zip } from "fflate";
      const map = await import("react-leaflet");`;
    expect(packagesImportedBy(code)).toEqual([
      "@base-ui/react",
      "leaflet",
      "leaflet",
      "@chakra-ui/react",
      "fflate",
      "react-leaflet",
    ]);
  });

  it("ignores relative imports, the @/ alias, and text that only looks like an import", () => {
    const code = `
      import { strings } from "./strings";
      import { summarise } from "@/core/summarise";
      import Button from "../components/Button";
      // import { Box } from "@chakra-ui/react";
      const hint = 'paste from "@mui/material"';`;
    expect(packagesImportedBy(code)).toEqual([]);
  });
});
