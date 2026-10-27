import type { IconDefinition } from "./icons";
import { iconShape } from "./iconSvg";
import "./Icon.css";

/**
 * A UI icon (ADR 0028): one em high, coloured with `currentColor` so it follows the text and the theme.
 * Decorative: the button or figure around it carries the accessible name.
 */
export function Icon({ icon, className }: { icon: IconDefinition; className?: string }) {
  const { viewBox, paths } = iconShape(icon);
  const [width, height] = icon.icon;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-icon={icon.iconName}
      viewBox={viewBox}
      width={`${width / height}em`}
      height="1em"
      fill="currentColor"
      className={className ? `icon ${className}` : "icon"}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
