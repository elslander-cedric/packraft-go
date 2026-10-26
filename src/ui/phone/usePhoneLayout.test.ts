import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHONE_QUERY } from "./usePhoneLayout";

describe("PHONE_QUERY", () => {
  // The disclaimer banner is server-rendered, so the phone hides it with CSS (ADR 0026).
  it("is the media query that hides the disclaimer banner in globals.css", () => {
    const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    const rule = css.match(/@media ([^{]+)\{\s*\.navigation-notice\s*\{\s*display: none;/);
    expect(rule?.[1].trim()).toBe(PHONE_QUERY);
  });

  // On Android Chrome 100vh counts the area behind the toolbar, which hid the bottom buttons.
  it("the app fills the visible screen (dvh), not the screen behind the browser's toolbar (vh)", () => {
    const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    const app = css.match(/\n\.app \{([^}]*)\}/)?.[1];
    expect(app).toContain("height: 100dvh;");
  });
});
