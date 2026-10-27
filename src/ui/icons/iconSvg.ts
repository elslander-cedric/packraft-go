import type { IconDefinition } from "./icons";

/** Where to draw an icon inside another SVG drawing, in that drawing's units. */
export type IconPlacement = { x: number; y: number; width: number; height: number };

/** The icon's box and its paths, from Font Awesome's icon data. */
export function iconShape({ icon }: IconDefinition): { viewBox: string; paths: string[] } {
  const [width, height, , , pathData] = icon;
  return { viewBox: `0 0 ${width} ${height}`, paths: typeof pathData === "string" ? [pathData] : pathData };
}

/**
 * An icon as an `<svg>` string, for Leaflet markers, which take HTML rather than React (ADR 0028).
 * Coloured with `currentColor` and hidden from screen readers: the marker carries the name.
 * `at` places it inside another drawing, e.g. the flag inside an access point marker.
 */
export function iconSvg(icon: IconDefinition, at?: IconPlacement): string {
  const { viewBox, paths } = iconShape(icon);
  const placement = at ? ` x="${at.x}" y="${at.y}" width="${at.width}" height="${at.height}"` : "";
  return (
    `<svg aria-hidden="true" focusable="false" data-icon="${icon.iconName}"${placement} viewBox="${viewBox}" fill="currentColor">` +
    paths.map((d) => `<path d="${d}"/>`).join("") +
    "</svg>"
  );
}
