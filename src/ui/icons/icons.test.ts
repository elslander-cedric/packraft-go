import { faFlag, faTent } from "@fortawesome/free-solid-svg-icons";
import { describe, expect, it } from "vitest";
import { iconSvg } from "./iconSvg";

describe("iconSvg (#143, ADR 0028)", () => {
  it("draws the icon's path in its own box, coloured by currentColor and hidden from screen readers", () => {
    const svg = iconSvg(faTent);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 512 512"/);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('data-icon="tent"');
    expect(svg).toContain('<path d="M26.9 206.9L3.7 444.9');
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("places the icon where asked inside another drawing", () => {
    const svg = iconSvg(faFlag, { x: 6, y: 7, width: 12, height: 10 });
    expect(svg).toMatch(/^<svg [^>]*x="6" y="7" width="12" height="10"/);
    expect(svg).toContain('viewBox="0 0 448 512"');
  });

  it("draws every path of a multi-path icon", () => {
    const twoPaths = { ...faTent, icon: [16, 16, [], "", ["M0 0h1", "M2 2h1"]] as typeof faTent.icon };
    expect(iconSvg(twoPaths).match(/<path /g)).toHaveLength(2);
  });
});
