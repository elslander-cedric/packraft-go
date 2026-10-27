# 28. Font Awesome Free for UI icons

Date: 2026-10-27

## Status
Accepted

## Context
The phone planner's buttons and figures use emoji and Unicode symbols as icons (🥾 🛶 ⛺ ⏱ ◎ ↶ ⚑ ✕ ≋ ☰ ▾ ‹ › ↗ ↘), kept as text in the strings module. Emoji come from each device's system font, so they look different on macOS, iOS and Android and are full colour; the symbols don't match each other in weight or size. Together they look dated. The camp and access point map markers are separate hand-drawn SVGs.

We considered Font Awesome Free, Tabler Icons (MIT) and Lucide (ISC). Tabler and Lucide have a kayak icon; Font Awesome Free has no kayak or canoe. We chose Font Awesome anyway, for its familiar, solid look.

## Decision
- All UI icons, including the drawings inside the camp and access point markers, come from Font Awesome Free's **Solid** style. The free Regular style is too small to cover our icons, so styles aren't mixed. The PWA app icon is the brand and stays as it is.
- Hike is `faShoePrints` and paddle is `faWater`: there's no kayak in Font Awesome Free, and a sailboat or swimmer would be the wrong activity.
- Only `@fortawesome/free-solid-svg-icons` is installed (exact version, on the runtime dependency allowlist). We don't use `fontawesome-svg-core` or `react-fontawesome`: they add CSS to the page at runtime, and Leaflet markers need an SVG string, not a React component. Our own wrapper in `src/ui/icons/` draws the `<svg>` from the icon data, as a React `Icon` for screens and an `iconSvg()` string for map markers. Icons use `currentColor`, so they follow the theme.
- No icon font: it would be a second font and break font-independent layout tests (#70).
- Icons aren't text, so they leave the strings module. Their accessible names stay there (ADR 0013).

## Consequences
- Font Awesome Free icons are licensed CC BY 4.0. The credit stays in the package's files; don't strip it.
- Markers keep their current outer shape; only the drawing inside changes, so selection, finger-sized markers and dragging are unaffected.
- If a kayak icon becomes important, switching to another set only touches `src/ui/icons/`.
