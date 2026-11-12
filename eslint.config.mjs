import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Module boundaries (CODING_STANDARDS.md "Boundaries"). A later block replaces an earlier one's
// `no-restricted-imports` for the files both match, so each block lists everything that applies.
const baseUi = {
  group: ["@base-ui/*", "@base-ui-components/*", "@mui/base", "@mui/base/*"],
  message: "Use the wrappers in src/ui/components (ADR 0020).",
};
const fontAwesome = {
  group: ["@fortawesome/*"],
  message: "Use the icons in src/ui/icons (ADR 0028).",
};
const testOnly = {
  group: ["@/testing/*", "@/core/testing/*", "**/testing/*", "@/dataprep/*", "**/prepare/*"],
  message: "Test helpers and offline data preparation never ship in the app.",
};
const anythingOutsideTheCore = {
  regex: "^[^.]",
  message: "The trip planner core imports only other core modules.",
};
const restrictImports = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const TESTS = ["**/*.test.ts", "**/*.test.tsx", "src/testing/**", "src/core/testing/**", "e2e/**"];
// Run by hand or by scripts, never bundled: data preparation and the live service checks.
const OFFLINE = ["src/dataprep/**", "src/access/prepare/**", "src/**/liveCheck.ts", "src/map/baseMapCheck.ts", "scripts/**"];

// Attributes whose value is shown to the user or read out by a screen reader.
const VISIBLE_ATTRIBUTES =
  "/^(title|alt|placeholder|label|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/";
const HAS_WORDS = "/[A-Za-z\\u00C0-\\u024F]/";
const useStrings = "User-facing text belongs in src/ui/strings.ts (ADR 0013).";
// Text rendered between tags: a literal on its own or as a branch of `? :`, `&&`, `||`, `??`.
const RENDERED = ":matches(JSXElement, JSXFragment) > JSXExpressionContainer";
const BRANCH = ":matches(ConditionalExpression, LogicalExpression)";
const LITERAL = `Literal[value=${HAS_WORDS}]`;
const TEMPLATE = `TemplateLiteral > TemplateElement[value.raw=${HAS_WORDS}]`;
const ATTRIBUTE = `JSXAttribute[name.name=${VISIBLE_ATTRIBUTES}]`;
const hardCodedText = [
  `JSXText[value=${HAS_WORDS}]`,
  ...[RENDERED, `${RENDERED} > ${BRANCH}`, ATTRIBUTE, `${ATTRIBUTE} > JSXExpressionContainer`, `${ATTRIBUTE} > JSXExpressionContainer > ${BRANCH}`]
    .flatMap((where) => [`${where} > ${LITERAL}`, `${where} > ${TEMPLATE}`]),
].map((selector) => ({ selector, message: useStrings }));

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**"],
    rules: {
      ...restrictImports(baseUi, fontAwesome, testOnly),
      // Confirmations are in-page dialogs (ADR 0020).
      "no-alert": "error",
      "no-restricted-properties": ["error", { object: "self", property: "confirm" }],
    },
  },
  { files: ["src/**/*.tsx"], ignores: TESTS, rules: { "no-restricted-syntax": ["error", ...hardCodedText] } },
  { files: OFFLINE, rules: restrictImports(baseUi, fontAwesome) },
  {
    // The trip planner core is pure TypeScript: no React, no browser, no network.
    files: ["src/core/**"],
    rules: {
      ...restrictImports(anythingOutsideTheCore),
      "no-restricted-globals": ["error", "fetch", "XMLHttpRequest", "WebSocket", "window", "document"],
    },
  },
  { files: TESTS, rules: { ...restrictImports(baseUi, fontAwesome), "no-restricted-globals": "off" } },
  { files: ["src/ui/components/**"], rules: restrictImports(fontAwesome) },
  { files: ["src/ui/icons/**"], rules: restrictImports(baseUi) },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);
